// Thin client for the local relay (relay/server.mjs). Every call talks to
// the relay directly — no mock fallback. If the relay is down or a call
// fails, the error propagates to the caller instead of a canned response.

const DEFAULT_BASE = "http://127.0.0.1:8787";
const HEALTH_TIMEOUT_MS = 800;
const CALL_TIMEOUT_MS = 45000; // scoring calls spawn a real CLI process — generous

async function getBase() {
  const { relayBase } = await chrome.storage.local.get("relayBase");
  return relayBase || DEFAULT_BASE;
}

async function withTimeout(promise, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await promise(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHealth() {
  const base = await getBase();
  try {
    const res = await withTimeout(
      (signal) => fetch(`${base}/health`, { signal }),
      HEALTH_TIMEOUT_MS,
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function post(path, body) {
  const base = await getBase();
  const res = await withTimeout(
    (signal) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }),
    CALL_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`relay ${path} → HTTP ${res.status}`);
  return res.json();
}

export async function score(tier, payload) {
  return post("/score", { tier, ...payload });
}

export async function saveShortlist(entry) {
  return post("/shortlist", entry);
}

// Cross-machine selector sync (Tier 1's "refreshed from the relay" half —
// chrome.storage.local stays the fast local cache regardless). Not part of
// the plan's enumerated /score /memory /shortlist /health list, but Tier 1's
// own description requires *some* relay-side persistence for
// data/site-selectors.yml to be shared beyond one browser profile — this is
// that endpoint, named consistently with the others. Best-effort: swallow
// failure the same way every other relay call here does.
export async function syncSelector(hostname, entry) {
  try {
    return await post("/selectors", { hostname, ...entry });
  } catch {
    return { ok: false };
  }
}

export async function fetchSelectors() {
  const base = await getBase();
  try {
    const res = await withTimeout((signal) => fetch(`${base}/selectors`, { signal }), HEALTH_TIMEOUT_MS);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
