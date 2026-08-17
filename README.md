# career-ops-lite

Standalone job-scoring browser extension. Click it on a job posting, get a
score against your own CV and deal-breakers at one of three tiers, and
stockpile the good ones. No career-ops checkout required at runtime — this
project is self-contained.

## Setup (one-time)

1. `cp data/cv.template.md data/cv.md` — fill in your real CV.
2. `cp data/profile.template.md data/profile.md` — fill in archetypes, comp
   floor, location policy, deal-breakers, etc.
3. `node relay/generate-brief.mjs` — spawns a CLI to condense `profile.md`
   into `data/brief.md` (the file the **light** tier reads). Re-run this
   anytime you've edited `profile.md` by hand and want `brief.md` caught up;
   the extension's "teach it something" input keeps both in sync on its own
   after that.

`data/cv.md`, `data/profile.md`, and `data/brief.md` are gitignored — your
data, never committed.

## Running it

1. **Start the relay**: `node relay/server.mjs` — listens on
   `http://127.0.0.1:8787`, binds localhost only. Leave it running in a
   terminal while you use the extension.
2. **Load the extension**: `chrome://extensions` → enable **Developer mode**
   → **Load unpacked** → select this repo's `extension/` folder → pin it.

If the relay isn't running, the popup shows a **relay down (mock)** badge
and scoring still works, but returns clearly-labeled fake verdicts — useful
for testing the UI, not for real scoring. Real scores only happen once
`relay/server.mjs` is up and `data/cv.md`/`data/profile.md` are filled in.

## Using it

1. Open a job posting, click the extension icon.
2. **Entity detection** happens automatically:
   - Greenhouse/Lever/Ashby/Workday → hits that platform's public API
     directly, no page scraping (Tier 0).
   - iCIMS → reads the page's embedded JobPosting data (Tier 0b).
   - A site you've picked a selector on before → auto-highlights it
     (Tier 1).
   - Anything else → tries to auto-detect the main content block (Tier 2),
     or shows **Pick element manually** so you can click the JD block
     yourself (Tier 3, devtools-style hover-and-click).
3. Pick a **tier**, then **Score this page**:
   - **Light** — reads only `brief.md`. Fastest, cheapest, one-line verdict.
     Nothing saved to disk.
   - **Normal** — reads `cv.md` + `profile.md`. Structured multi-section
     reasoning (role summary, CV match, level/strategy, comp), saved to
     `data/scores/{slug}.md`.
   - **Ultra** — Normal + a bounded company-research pass + a legitimacy
     read, also saved to `data/scores/{slug}.md`.
4. **Save to shortlist**: manual button (any verdict — your override) or
   check **auto-save on PASS/MARGINAL** to save automatically whenever a
   score clears the bar. Either way it appends a row to `data/shortlist.md`
   formatted to paste straight into a real career-ops checkout's
   `data/pipeline.md` later.
5. **Teach it something**: separate text box, not tied to a specific job —
   e.g. "no on-site roles anymore." Sent to the CLI, which edits the right
   section of `profile.md` (not a blind append) and regenerates `brief.md`.
6. **Saved selectors**: "Show saved selectors" lists every site you've
   picked a selector on, each with a **Remove**. On a site with an existing
   selector, the popup also shows **Highlight** (flash it on the page to
   confirm it still resolves) and **Reselect** (pick again). A pick session
   started but not finished shows **Stop picking** — safe to close the
   popup mid-pick and come back, it won't lose track or show the wrong
   button.

## Commands reference

| Command | What it does |
|---|---|
| `node relay/server.mjs` | Starts the relay on `127.0.0.1:8787` |
| `node relay/generate-brief.mjs [cliId]` | One-off: derive `brief.md` from `profile.md`. Optional CLI id (`claude`, `codex`, ...) to force which one; defaults to the first installed |

Everything else happens through the extension popup, not the command line.
The relay's own HTTP endpoints (for curl-testing or debugging):

| Endpoint | Purpose |
|---|---|
| `GET /health` | `{ok, clis}` — which CLIs are installed and detected |
| `POST /score` | `{tier, jd, url, title, company, location?, ats?}` → verdict/score/reason |
| `POST /memory` | `{text}` → edits `profile.md` + `brief.md` |
| `POST /shortlist` | `{url, company, role, tier, verdict, score, jdSlug, date}` → appends a row |
| `GET`/`POST /selectors` | Read/write the learned site-selector map |

## Security notes

- Relay binds `127.0.0.1` only — never exposed beyond this machine.
- Every spawned CLI call is scoped with `--allowedTools` (`Read` for
  scoring, `Read Edit Write` only for the memory-edit call) — a job posting
  can't make the model do anything beyond what that scope allows, no matter
  what it says.
- Captured JD text is scanned for known prompt-injection patterns
  ("ignore previous instructions," etc.). A match doesn't block anything —
  it's flagged in the response, the popup, and the saved `jds/*.md` header,
  same as career-ops's own approach: quote the anomaly, don't auto-react to
  it.
- No shared-secret between extension and relay yet — anything that can
  reach `127.0.0.1:8787` on this machine can call the relay. Low risk today
  (relay only reads/writes this project's own `data/`, no destructive
  endpoints), but worth tightening before leaving the relay running
  unattended for long periods.

## What's not built yet

- **Onboarding wizard** — setup above is manual copy-and-fill, no guided
  interactive flow.
- **Multi-CLI verified** — only `claude` has been tested end-to-end. The
  other six (`codex`, `opencode`, `copilot`, `qwen`, `agy`, `grok`) are
  wired into `relay/clis.mjs` but their permission/non-interactive flags are
  unverified guesses.
- **Tier 0 API shapes** — Greenhouse/Lever/Ashby/Workday single-job
  endpoints are code-reviewed, not yet confirmed against a real live
  posting of each type.
- **No prompt caching / session reuse** — every score is a cold CLI spawn
  that re-reads its files from scratch. Cheap in tokens for the light tier
  by design, but nothing is optimized for repeated calls.
- Extension icons are placeholder circles.

## Troubleshooting

- Service worker errors: `chrome://extensions` → this extension → "service
  worker" link → console.
- Content script errors: regular page DevTools console.
- Relay errors: check the terminal running `node relay/server.mjs`.
- Popup says "Not a job page": either the site isn't Tier 0 and needs the
  picker, or the tab URL scheme isn't `http(s)://` (chrome://, file://, etc.
  are expected to say that).
