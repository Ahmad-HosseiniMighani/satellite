// One-shot "show me what's saved" flash — distinct from picker.js's stateful
// pick session and extractor.js's Tier-1 confirm overlay: this just proves a
// stored selector still resolves to something, for the popup's saved-selector
// list "Highlight" button.
if (!window.__careerOpsLiteHighlighterInstalled) {
  window.__careerOpsLiteHighlighterInstalled = true;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "co-lite:flash") return;
    const el = document.querySelector(msg.selector);
    if (!el) {
      sendResponse({ ok: false });
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const rect = el.getBoundingClientRect();
    const overlay = document.createElement("div");
    overlay.className = "co-lite-tier1-overlay";
    overlay.style.top = `${rect.top + window.scrollY}px`;
    overlay.style.left = `${rect.left + window.scrollX}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    document.documentElement.appendChild(overlay);
    setTimeout(() => overlay.remove(), 2000);
    sendResponse({ ok: true });
  });
}
