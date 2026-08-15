import { detectAts } from "./ats/index.js";
import { checkHealth, score, saveMemory, saveShortlist, syncSelector, fetchSelectors } from "./relay.js";

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content/extractor.js"] });
}

async function extractFromTab(tabId, mode, selector) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, { type: "co-lite:extract", mode, selector });
}

async function getLearnedSelectors() {
  const { selectors = {} } = await chrome.storage.local.get("selectors");
  return selectors;
}

// Picker state has to survive the popup closing — clicking the page to pick
// an element closes the popup by design — and survive the service worker
// itself being suspended/restarted (MV3 workers are ephemeral), so it lives
// in chrome.storage.local, not a JS variable. Keyed by tabId since only one
// picker session makes sense per tab at a time.
async function getPickerActive() {
  const { pickerActive } = await chrome.storage.local.get("pickerActive");
  return pickerActive || null;
}

async function clearPickerActive(tabId) {
  const active = await getPickerActive();
  if (active && (tabId === undefined || active.tabId === tabId)) {
    await chrome.storage.local.set({ pickerActive: null });
  }
}

// A picker left active on a tab that's since navigated or closed is a stale
// "Stop picking" button that does nothing — clear it opportunistically.
chrome.tabs.onRemoved.addListener((tabId) => clearPickerActive(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") clearPickerActive(tabId);
});

// Runs the full Tier 0 → 0b → 1 → 2 → 4 chain and returns the first tier that
// produces usable JD text. Tier 0's ATS API is tried first (cheapest, most
// structured, no DOM access needed); everything else falls through to the
// content script.
async function captureJd(tab) {
  const ats = detectAts(tab.url);

  if (ats && ats.fetchJob) {
    try {
      const job = await ats.fetchJob(ats);
      if (job && !job.needsDomFallback && job.description) {
        return { tier: 0, ats: ats.ats, ...job };
      }
    } catch {
      // API fetch failed (network, shape drift) — fall through to DOM tiers
      // rather than surfacing an error the user can't act on.
    }
  }

  if (ats?.ats === "icims") {
    const r = await extractFromTab(tab.id, "jsonld");
    if (r?.ok) return { tier: "0b", ats: "icims", title: r.title, company: r.company, description: r.description };
  }

  const hostname = new URL(tab.url).hostname;
  const learned = (await getLearnedSelectors())[hostname];
  if (learned) {
    const r = await extractFromTab(tab.id, "selector", learned.selector);
    if (r?.ok) return { tier: 1, selector: learned.selector, description: r.description };
  }

  const dense = await extractFromTab(tab.id, "density");
  if (dense?.ok) return { tier: 2, description: dense.description };

  const raw = await extractFromTab(tab.id, "raw");
  return { tier: 4, description: raw.description, unverified: true };
}

async function getState(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    return { tab: null, entity: { label: "Not a job page", ats: null } };
  }
  const ats = detectAts(tab.url);
  const hostname = new URL(tab.url).hostname;
  const learned = (await getLearnedSelectors())[hostname];
  const relayUp = await checkHealth();
  const active = await getPickerActive();

  let entity;
  if (ats) {
    entity = { ats: ats.ats, label: `${capitalize(ats.ats)} posting`, tier: ats.ats === "icims" ? "0b" : 0 };
  } else if (learned) {
    entity = { ats: null, label: `Known selector for ${hostname}`, tier: 1 };
  } else {
    entity = { ats: null, label: "Unknown site — will auto-detect or ask you to pick", tier: null };
  }

  return {
    tab: { url: tab.url, title: tab.title },
    entity,
    relayUp,
    hostname,
    selectorInfo: learned || null,
    pickerActiveHere: active?.tabId === tab.id,
  };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case "co-lite:get-state": {
        sendResponse(await getState(await getActiveTab()));
        break;
      }
      case "co-lite:capture": {
        const tab = await getActiveTab();
        const captured = await captureJd(tab);
        const result = await score(msg.tier, {
          jd: captured.description,
          url: tab.url,
          title: captured.title || tab.title,
          company: captured.company || "",
        });
        const full = { ...result, captured, tab: { url: tab.url, title: tab.title } };
        await chrome.storage.local.set({ lastCapture: full });
        sendResponse(full);
        break;
      }
      case "co-lite:get-last-capture": {
        const { lastCapture } = await chrome.storage.local.get("lastCapture");
        sendResponse(lastCapture || null);
        break;
      }
      case "co-lite:start-picker": {
        const tab = await getActiveTab();
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content/highlight.css"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/picker.js"] });
        await chrome.storage.local.set({
          pickerActive: { tabId: tab.id, hostname: new URL(tab.url).hostname, startedAt: Date.now() },
        });
        sendResponse({ ok: true });
        break;
      }
      case "co-lite:stop-picker": {
        const active = await getPickerActive();
        if (active) {
          try {
            await chrome.tabs.sendMessage(active.tabId, { type: "co-lite:stop-picker" });
          } catch {
            // tab already closed/navigated — nothing to clean up on its side
          }
        }
        await clearPickerActive();
        sendResponse({ ok: true });
        break;
      }
      case "co-lite:picked": {
        // Reached whether the user locked a selection or hit Escape — either
        // way the picker session on the page is over, so this is the one
        // place that always clears pickerActive (stop-picker is the other).
        if (!msg.cancelled) {
          const selectors = await getLearnedSelectors();
          const entry = { selector: msg.selector, kind: msg.kind, savedAt: new Date().toISOString() };
          selectors[msg.hostname] = entry;
          await chrome.storage.local.set({ selectors, lastPicked: { hostname: msg.hostname, ...entry } });
          syncSelector(msg.hostname, entry); // best-effort, fire-and-forget
        }
        await clearPickerActive(sender?.tab?.id);
        sendResponse({ ok: true });
        break;
      }
      case "co-lite:get-last-picked": {
        const { lastPicked } = await chrome.storage.local.get("lastPicked");
        sendResponse(lastPicked || null);
        break;
      }
      case "co-lite:get-selectors": {
        sendResponse(await getLearnedSelectors());
        break;
      }
      case "co-lite:remove-selector": {
        const selectors = await getLearnedSelectors();
        delete selectors[msg.hostname];
        await chrome.storage.local.set({ selectors });
        sendResponse({ ok: true });
        break;
      }
      case "co-lite:highlight-selector": {
        const selectors = await getLearnedSelectors();
        const entry = selectors[msg.hostname];
        if (!entry) {
          sendResponse({ ok: false, error: "no saved selector for this host" });
          break;
        }
        const tab = await getActiveTab();
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content/highlight.css"] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/highlighter.js"] });
        const result = await chrome.tabs.sendMessage(tab.id, { type: "co-lite:flash", selector: entry.selector });
        sendResponse(result ?? { ok: false });
        break;
      }
      case "co-lite:save-shortlist": {
        sendResponse(await saveShortlist(msg.payload));
        break;
      }
      case "co-lite:teach": {
        sendResponse(await saveMemory(msg.text));
        break;
      }
      case "co-lite:refresh-selectors": {
        const remote = await fetchSelectors();
        if (remote) {
          const local = await getLearnedSelectors();
          await chrome.storage.local.set({ selectors: { ...remote, ...local } });
        }
        sendResponse({ ok: !!remote });
        break;
      }
      default:
        break;
    }
  })();
  return true; // keep the message channel open for the async response above
});
