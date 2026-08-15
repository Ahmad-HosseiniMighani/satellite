// Thin client for the local relay (relay/server.mjs, not built yet — see
// career-ops-lite plan). Until it exists (or whenever it's unreachable), every
// call falls back to a canned mock response so the extension UI is fully
// clickable/testable on its own. Once relay/server.mjs is running, real
// responses take over automatically — no extension-side flag to flip.

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

function mockScore(tier, { company, title }) {
  const bands = {
    light: { verdict: "PASS", score: 4.1, reason: "[mock] archetype fit, comp/location clear the bar" },
    normal: { verdict: "MARGINAL", score: 3.6, reason: "[mock] solid CV match, comp is borderline" },
    ultra: { verdict: "PASS", score: 4.4, reason: "[mock] strong fit, company research turned up nothing concerning" },
  };
  const band = bands[tier] ?? bands.light;
  return {
    ok: true,
    mock: true,
    tier,
    verdict: band.verdict,
    score: band.score,
    reason: band.reason,
    company: company || "Unknown Co",
    role: title || "Unknown Role",
    jdPath: `data/jds/${(company || "unknown").toLowerCase()}.md`,
  };
}

export async function score(tier, payload) {
  try {
    return await post("/score", { tier, ...payload });
  } catch {
    return mockScore(tier, payload);
  }
}

export async function saveMemory(text) {
  try {
    return await post("/memory", { text });
  } catch {
    return { ok: true, mock: true, note: "relay unreachable — noted locally only, not yet written to profile.md" };
  }
}

export async function saveShortlist(entry) {
  try {
    return await post("/shortlist", entry);
  } catch {
    return { ok: true, mock: true, note: "relay unreachable — not yet written to shortlist.md" };
  }
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
    return { ok: false, mock: true };
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
