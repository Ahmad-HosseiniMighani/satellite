// Classic (non-module) content script, injected on demand via
// chrome.scripting.executeScript. Guards against double-injection since the
// popup may trigger a capture more than once per page load.
if (!window.__careerOpsLiteExtractorInstalled) {
  window.__careerOpsLiteExtractorInstalled = true;

  const NAV_WORDS = new Set([
    "home", "about", "careers", "jobs", "contact", "login", "sign in", "sign up",
    "privacy", "terms", "cookie", "blog", "menu", "search", "apply now", "share",
  ]);

  function compactText(s) {
    return String(s ?? "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Tier 0b: read the JobPosting JSON-LD block iCIMS (and many other ATSes)
  // already embed in the rendered page — no network fetch needed.
  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of scripts) {
      try {
        const data = JSON.parse(s.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "JobPosting") {
            return {
              title: item.title ?? document.title,
              company: item.hiringOrganization?.name ?? "",
              location:
                item.jobLocation?.address?.addressLocality ??
                item.jobLocation?.address?.addressRegion ??
                "",
              description: compactText(stripHtml(item.description ?? "")),
            };
          }
        }
      } catch {
        // not valid/relevant JSON-LD — keep scanning other blocks
      }
    }
    return null;
  }

  function stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.innerText || div.textContent || "";
  }

  // Tier 1: a previously learned, hostname-specific selector.
  function extractBySelector(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    return compactText(el.innerText || el.textContent || "");
  }

  // Tier 2: no learned selector — score candidate blocks by paragraph density
  // and pick the best one. Deliberately simple (not a full Readability port):
  // largest amount of text inside <main>/<article>/paragraph-dense <div>,
  // penalizing nav-like link-heavy blocks.
  function extractByDensity() {
    const candidates = [
      ...document.querySelectorAll("main, article, [role=main]"),
      ...document.querySelectorAll("div, section"),
    ];
    let best = null;
    let bestScore = 0;
    for (const el of candidates) {
      const text = (el.innerText || "").trim();
      if (text.length < 200) continue;
      const linkText = [...el.querySelectorAll("a")].reduce((n, a) => n + (a.innerText?.length ?? 0), 0);
      const linkDensity = linkText / Math.max(text.length, 1);
      if (linkDensity > 0.4) continue; // nav/footer-like — mostly links, skip
      const paragraphs = el.querySelectorAll("p, li").length;
      const score = text.length * (1 + Math.min(paragraphs, 20) / 20);
      if (score > bestScore) {
        bestScore = score;
        best = text;
      }
    }
    return best ? compactText(best) : null;
  }

  // Tier 4: last resort, whole-page text, flagged unverified by the caller.
  function extractRaw() {
    return compactText(document.body.innerText || document.body.textContent || "");
  }

  function isNavLabel(s) {
    return NAV_WORDS.has(String(s ?? "").trim().toLowerCase());
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "co-lite:extract") return;
    try {
      if (msg.mode === "jsonld") {
        const result = extractJsonLd();
        sendResponse(result ? { ok: true, ...result, tier: "0b" } : { ok: false });
      } else if (msg.mode === "selector") {
        const text = extractBySelector(msg.selector);
        sendResponse(text ? { ok: true, description: text, tier: 1 } : { ok: false });
      } else if (msg.mode === "density") {
        const text = extractByDensity();
        sendResponse(text ? { ok: true, description: text, tier: 2 } : { ok: false });
      } else if (msg.mode === "raw") {
        sendResponse({ ok: true, description: extractRaw(), tier: 4 });
      } else {
        sendResponse({ ok: false, error: `unknown mode: ${msg.mode}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  });

  // Exposed for the picker (content/picker.js) to reuse the same nav-word
  // filter when judging whether a manually-picked element looks nav-like.
  window.__careerOpsLiteIsNavLabel = isNavLabel;
}
