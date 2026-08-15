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

async function renderEntity() {
  const state = await send({ type: "co-lite:get-state" });
  if (!state?.tab) {
    $("entity-label").textContent = state?.entity?.label ?? "Not a job page";
    $("score-btn").disabled = true;
    return null;
  }
  $("entity-label").textContent = state.entity.label;
  renderRelayBadge(state.relayUp);
  $("pick-btn").classList.toggle("hidden", state.entity.tier !== null && state.entity.tier !== undefined);
  $("score-btn").disabled = false;

  const lastPicked = await send({ type: "co-lite:get-last-picked" });
  if (lastPicked && new URL(state.tab.url).hostname === lastPicked.hostname) {
    const banner = $("picked-banner");
    banner.textContent = `Selector saved for this site (${lastPicked.kind}: ${lastPicked.selector}). It'll auto-highlight next time.`;
    banner.classList.remove("hidden");
  }
  return state;
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
  $("pick-btn").addEventListener("click", async () => {
    await send({ type: "co-lite:start-picker" });
    window.close(); // picker needs the user interacting with the page, not the popup
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
