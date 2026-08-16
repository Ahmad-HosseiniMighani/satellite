const $ = (id) => document.getElementById(id);

function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function selectedTier() {
  return document.querySelector('input[name="tier"]:checked').value;
}

function renderRelayBadge(up) {
  const badge = $("relay-badge");
  badge.textContent = up ? "relay up" : "relay down (mock)";
  badge.className = `badge ${up ? "badge-up" : "badge-down"}`;
  $("relay-banner").classList.toggle("hidden", up);
}

let currentHostname = null;

async function renderEntity() {
  const state = await send({ type: "co-lite:get-state" });
  if (!state?.tab) {
    $("entity-label").textContent = state?.entity?.label ?? "Not a job page";
    $("score-btn").disabled = true;
    $("pick-btn").classList.add("hidden");
    $("stop-picker-btn").classList.add("hidden");
    $("selector-controls").classList.add("hidden");
    return null;
  }
  currentHostname = state.hostname;
  $("entity-label").textContent = state.entity.label;
  renderRelayBadge(state.relayUp);
  $("score-btn").disabled = false;

  // Three mutually exclusive states for the picker area: actively picking on
  // this tab, a selector already saved for this host, or neither (offer to
  // pick). Reflecting pickerActiveHere here — not just "was a pick made" —
  // is what fixes the reopen-shows-Pick-again bug: the popup now asks the
  // background worker for ground truth instead of assuming its own idle state.
  const picking = state.pickerActiveHere;
  const hasSelector = !!state.selectorInfo;

  $("stop-picker-btn").classList.toggle("hidden", !picking);
  $("pick-btn").classList.toggle("hidden", picking || hasSelector || state.entity.tier !== null);
  $("selector-controls").classList.toggle("hidden", picking || !hasSelector);

  if (hasSelector) {
    const info = state.selectorInfo;
    $("selector-info").textContent = `${info.kind}: ${info.selector} (saved ${new Date(info.savedAt).toLocaleDateString()})`;
  }

  return state;
}

function flashStatus(text) {
  const banner = $("picked-banner");
  banner.textContent = text;
  banner.classList.remove("hidden");
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => banner.classList.add("hidden"), 2500);
}

async function startPicker() {
  await send({ type: "co-lite:start-picker" });
  window.close(); // picker needs the user interacting with the page, not the popup
}

async function renderSelectorsList() {
  const list = $("selectors-list");
  const selectors = await send({ type: "co-lite:get-selectors" });
  const entries = Object.entries(selectors || {});
  list.innerHTML = "";
  if (!entries.length) {
    list.innerHTML = '<li class="selectors-empty">No selectors saved yet.</li>';
    return;
  }
  for (const [hostname, info] of entries) {
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "sel-meta";
    meta.innerHTML = `<div class="sel-host">${hostname}</div><div class="sel-selector">${info.kind}: ${info.selector}</div>`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "danger";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      await send({ type: "co-lite:remove-selector", hostname });
      await renderSelectorsList();
      if (hostname === currentHostname) await renderEntity();
    });
    li.appendChild(meta);
    li.appendChild(removeBtn);
    list.appendChild(li);
  }
}

function verdictClass(verdict) {
  return `result-card verdict-${verdict || "MARGINAL"}`;
}

function renderResult(result) {
  $("result-section").classList.remove("hidden");
  const card = $("result-card");
  card.className = verdictClass(result.verdict);
  const lines = [
    `${result.verdict ?? "?"} · ${result.score ?? "?"}/5 · ${result.tier} tier`,
    result.mock ? "(mock — relay not running)" : "",
    result.anomalies?.length
      ? `\n⚠️ This posting contains text matching known prompt-injection patterns (quoted, not obeyed by the scorer): "${result.anomalies[0]}"${result.anomalies.length > 1 ? ` (+${result.anomalies.length - 1} more)` : ""}`
      : "",
    "",
    result.reason ?? "",
    result.tier !== "light" && !result.mock ? `\nSaved: ${result.jdPath ?? "data/scores/…"}` : "",
  ].filter(Boolean);
  card.textContent = lines.join("\n");
  return result;
}

async function maybeAutoSave(result) {
  const auto = $("auto-save-toggle").checked;
  const qualifies = result.verdict === "PASS" || result.verdict === "MARGINAL";
  if (auto && qualifies) {
    await doSave(result, "auto-saved");
  }
}

async function doSave(result, statusPrefix = "saved") {
  const payload = {
    url: result.tab?.url,
    company: result.company,
    role: result.role,
    tier: result.tier,
    verdict: result.verdict,
    score: result.score,
    jdSlug: result.jdPath,
    date: new Date().toISOString().slice(0, 10),
  };
  const res = await send({ type: "co-lite:save-shortlist", payload });
  $("save-status").textContent = res?.mock ? `${statusPrefix} (mock — relay not running)` : `${statusPrefix} to shortlist.md`;
}

let lastResult = null;

async function onScore() {
  const btn = $("score-btn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Scoring…';
  try {
    const result = await send({ type: "co-lite:capture", tier: selectedTier() });
    lastResult = result;
    renderResult(result);
    await maybeAutoSave(result);
  } finally {
    btn.disabled = false;
    btn.textContent = "Score this page";
  }
}

async function init() {
  await renderEntity();

  const cached = await send({ type: "co-lite:get-last-capture" });
  if (cached) {
    lastResult = cached;
    renderResult(cached);
  }

  $("score-btn").addEventListener("click", onScore);
  $("pick-btn").addEventListener("click", startPicker);
  $("reselect-btn").addEventListener("click", startPicker);
  $("stop-picker-btn").addEventListener("click", async () => {
    await send({ type: "co-lite:stop-picker" });
    await renderEntity();
  });
  $("remove-selector-btn").addEventListener("click", async () => {
    if (!currentHostname) return;
    await send({ type: "co-lite:remove-selector", hostname: currentHostname });
    flashStatus("Selector removed.");
    await renderEntity();
  });
  $("highlight-btn").addEventListener("click", async () => {
    if (!currentHostname) return;
    const res = await send({ type: "co-lite:highlight-selector", hostname: currentHostname });
    flashStatus(res?.ok ? "Highlighted on page." : "Couldn't find that element on the current page.");
  });
  $("toggle-selectors-btn").addEventListener("click", async () => {
    const list = $("selectors-list");
    const willShow = list.classList.contains("hidden");
    if (willShow) await renderSelectorsList();
    list.classList.toggle("hidden", !willShow);
    $("toggle-selectors-btn").textContent = willShow ? "Hide saved selectors" : "Show saved selectors";
  });
  $("save-btn").addEventListener("click", () => lastResult && doSave(lastResult));
  $("teach-btn").addEventListener("click", async () => {
    const input = $("teach-input");
    const text = input.value.trim();
    if (!text) return;
    const res = await send({ type: "co-lite:teach", text });
    $("teach-status").textContent = res?.mock ? "noted (mock — relay not running)" : "saved to profile.md";
    input.value = "";
  });
}

init();
