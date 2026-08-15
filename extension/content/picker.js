// Tier 3: devtools-style manual element picker. Injected on demand (popup's
// "Pick element" button), removes itself on lock/cancel rather than staying
// resident, since it's an active UI mode, not a passive listener.
if (!window.__careerOpsLitePickerActive) {
  window.__careerOpsLitePickerActive = true;

  const overlay = document.createElement("div");
  overlay.className = "co-lite-hover-overlay";
  document.documentElement.appendChild(overlay);

  const banner = document.createElement("div");
  banner.className = "co-lite-picker-banner";
  banner.textContent = "career-ops-lite: click the job description block (Esc to cancel)";
  document.documentElement.appendChild(banner);

  function positionOverlay(el) {
    const rect = el.getBoundingClientRect();
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.display = "block";
  }

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el && el !== overlay && el !== banner) positionOverlay(el);
  }

  // Durable-selector derivation, priority order: stable id > unique single
  // class > unique short class combo > bounded structural path (flagged
  // fragile). Rejects auto-generated-looking ids (long hashes, pure digits)
  // since those won't survive the site's next deploy.
  function looksGenerated(id) {
    return /^[a-f0-9]{8,}$/i.test(id) || /^\d+$/.test(id) || id.length > 40;
  }

  function deriveSelector(startEl) {
    let el = startEl;
    for (let depth = 0; el && depth < 6; depth++, el = el.parentElement) {
      if (el.id && !looksGenerated(el.id)) {
        return { selector: `#${CSS.escape(el.id)}`, kind: "id" };
      }
      for (const cls of el.classList) {
        if (!cls || looksGenerated(cls)) continue;
        if (document.getElementsByClassName(cls).length === 1) {
          return { selector: `.${CSS.escape(cls)}`, kind: "class" };
        }
      }
      if (el.classList.length >= 2) {
        const combo = [...el.classList].map((c) => `.${CSS.escape(c)}`).join("");
        if (document.querySelectorAll(combo).length === 1) {
          return { selector: combo, kind: "class-combo" };
        }
      }
    }
    // Last resort: bounded structural path from a nearby stable ancestor.
    const path = [];
    let cur = startEl;
    for (let depth = 0; cur && cur !== document.body && depth < 4; depth++, cur = cur.parentElement) {
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      const idx = parent ? [...parent.children].indexOf(cur) + 1 : 1;
      path.unshift(`${tag}:nth-child(${idx})`);
    }
    return { selector: path.join(" > "), kind: "structural" };
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    chrome.runtime.onMessage.removeListener(onStopMessage);
    overlay.remove();
    banner.remove();
    window.__careerOpsLitePickerActive = false;
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    const { selector, kind } = deriveSelector(el);
    const description = (el.innerText || el.textContent || "").trim();
    chrome.runtime.sendMessage({
      type: "co-lite:picked",
      selector,
      kind,
      description,
      hostname: location.hostname,
    });
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      chrome.runtime.sendMessage({ type: "co-lite:picked", cancelled: true });
      cleanup();
    }
  }

  // The popup closes the instant the user clicks the page (that's how picking
  // works), so "stop" has to reach this content script asynchronously, later,
  // from the background worker — not from the popup directly. No response
  // needed: the background worker owns clearing its own pickerActive state.
  function onStopMessage(msg) {
    if (msg?.type === "co-lite:stop-picker") cleanup();
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  chrome.runtime.onMessage.addListener(onStopMessage);
}
