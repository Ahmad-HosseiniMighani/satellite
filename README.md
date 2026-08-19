# Satellite 1.4 (Beta)

![Satellite](./git-logo.png)

Standalone job-scoring browser extension. Click it on a job posting, get a
score against your own CV and deal-breakers at one of three tiers, and
stockpile the good ones.

This is an Beta version of extension and relay, I am using it myself and it helps me handpick some gated positions without violating anything :) (fingers crossed).

Useful for anyone who is tired of copy pasting everything, and want to have something similar to LinkedIn AI to evaluate their CV and stories against jobs.

Feel free to report issues, custom features, or even pull requests.

Inspired by [career-ops](https://github.com/santifer/career-ops) by [Santiago Fernández de Valderrama Aparicio](https://github.com/santifer).

## How It Works

### The pieces

```txt
┌─────────────┐   captured JD text   ┌──────────────────┐   spawns    ┌─────────────┐
│  extension   │ ───────────────────>│  relay/server.mjs │ ──────────>│  a CLI (-p)  │
│ (in-browser) │<─────────────────── │  (127.0.0.1:8787)  │<───────────│  e.g. claude │
└─────────────┘   verdict/score      └──────────────────┘  stdout     └─────────────┘
                                              │                              │
                                              │ writes/reads                 │ reads
                                              ▼                              ▼
                                     data/jds/{slug}.md            prompts/{tier}.md
                                     data/scores/{slug}.md         data/cv.md
                                     data/shortlist.md             data/profile.md
                                     data/site-selectors.json      data/brief.md
```

Three independent pieces, talking over plain HTTP/JSON and the filesystem —
no shared database, no framework, no external dependency beyond Node itself
and whichever CLI you have installed:

- **`extension/`** — runs in your browser, where you're already logged in.
  Figures out what's on the page (see Entity detection below), and is the
  only piece that ever touches the DOM.
- **`relay/server.mjs`** — a plain `node:http` server. Its only two jobs:
  turn a `POST /score` into a spawned CLI process and parse its answer, and
  read/write the small set of files in `data/`. It never talks to the job
  site itself, never sees your browser session — by the time it gets
  anything, the extension has already extracted plain text.
- **The CLI** (`claude`, `codex`, etc.) — a fresh, disposable process per
  request. It has no memory of previous calls; instead its `cwd` is pinned
  to this project's root, so its own `Read` tool sees `cv.md`/`profile.md`/
  `brief.md` fresh every time. **That's the whole memory mechanism** — no
  conversation history, no prompt cache, just small curated files re-read
  on disk. Editing `profile.md` (by hand, or via "teach it something") is
  the entire act of "remembering" something; every future call just reads
  the updated file for free.

### End-to-end workflow, one capture

1. You click the extension icon on a job posting.
2. **Entity detection** (all in the browser, before anything is sent
   anywhere): tries known-ATS APIs first (Tier 0), falls back through a
   learned selector (Tier 1), auto-detected main content (Tier 2), a manual
   pick (Tier 3), or raw page text as a last resort (Tier 4). Exactly one of
   these produces the JD text that gets scored — see `extraction tiers`
   further down for the full fallback chain.
3. You pick a tier (light/normal/ultra) and click **Score this page**. The
   extension POSTs `{tier, jd, url, title, company, ...}` to
   `relay/server.mjs`.
4. The relay:
   - runs its own prompt-injection anomaly scan over the raw JD text
     (independent of what any model later does with it),
   - writes the JD to `data/jds/{slug}.md`,
   - builds a one-line instruction — "read `prompts/{tier}.md` and follow
     it, the JD is at this path" — and spawns the CLI with that instruction,
     scoped to exactly the tools that tier needs (`--allowedTools Read` for
     scoring; nothing more),
   - the CLI, running fresh in this project's directory, reads whichever
     files that tier's prompt tells it to (see below), reasons, and prints
     its answer ending in one machine-parseable line: `SCORE: {verdict} |
     {X.X}/5 | {reason}`,
   - the relay regexes out the *last* such line in the output (in case the
     model echoed instructions earlier), saves the full reasoning to
     `data/scores/{slug}.md` for normal/ultra, and returns the parsed result
     as JSON.
5. The popup renders the verdict card. You either save it to
   `data/shortlist.md` yourself, or it auto-saves if you had the
   PASS/MARGINAL toggle on.

Nothing in this path ever writes outside `data/` in this project, and
nothing auto-submits or auto-applies anywhere — scoring only.

### The three tiers, in detail

Each tier is a separate instruction file in `prompts/` — the relay doesn't
hardcode any scoring logic itself, it just tells the CLI which file to
follow.

**Light** (`prompts/light.md`)

- Reads **only** `data/brief.md` — never opens `cv.md` or `profile.md`.
  That restriction is the entire reason this tier is cheap: brief.md is a
  hand-condensed ~1.5–2K-token summary, not your full CV. If `brief.md`
  doesn't exist or still has unfilled `{placeholder}` text, it refuses and
  returns a `SKIP` verdict telling you to run `generate-brief.mjs` first.
- Logic: reads the JD → checks it against `brief.md`'s Hard DQ Criteria
  list (any hit caps the score at ≤2.5 immediately) → scores five weighted
  dimensions (archetype fit 30%, comp 25%, location 25%, CV/proof-point
  match 15%, red-flag deductions) → applies the Priority Override List
  (force PASS regardless of score, if the company's on it) → bands the
  result (≥3.5 PASS, 3.0–3.4 MARGINAL, <3.0 FAIL).
- Output: exactly one line, nothing else. Nothing is written to
  `data/scores/` — by design, this tier is disposable.

**Normal** (`prompts/normal.md`)

- Reads `data/cv.md` and `data/profile.md` in full.
- Logic: Role Summary (what the role actually is, level, team context) →
  **CV Match** (every JD requirement checked against `cv.md`, tagged
  met/partial/gap — must cite real CV evidence for a "met," forbidden from
  inventing experience; a requirement `cv.md` is silent on counts as a gap,
  not a maybe) → Level & Strategy (seniority fit against `profile.md`'s
  Identity line) → Comp & Demand (compares stated/estimated comp to your
  floor; if the JD has no comp listed, the estimate must be labeled as an
  estimate, never presented as the posted figure) → the same five-dimension
  weighted score as Light, but grounded in this fuller read.
- Output: the full reasoning above, as prose, *is* the report — followed by
  the same one-line `SCORE:` verdict as the last line. The relay saves
  everything before that line to `data/scores/{slug}.md`.

**Ultra** (`prompts/ultra.md`)

- Does everything Normal does (it's told to follow `normal.md`'s steps
  first), then adds two more passes:
  - **Company Research** — bounded, "a handful of searches, not an
    open-ended crawl": what the company does in one plain sentence, notable
    news in roughly the last 12 months, culture signals if findable (with a
    citation), likely near-term challenges for the role, and how this
    specific candidate's background plays as an angle into this specific
    company.
  - **Legitimacy read** — lightweight, not a fraud investigation:
    boilerplate-vs-tailored language, AI-buzzword-vs-actual-infrastructure
    mismatch, anything unusual about the posting itself. Explicitly told
    not to manufacture a concern if nothing stands out.
- Research and legitimacy findings can move the red-flag adjustment or
  comp/level confidence, but the prompt forbids inventing a disqualifier
  that isn't grounded in something actually found.
- Output: same shape as Normal (full prose + final `SCORE:` line), saved to
  `data/scores/{slug}.md` — just longer, with the two extra sections.

### Extraction tiers (how the JD text itself gets captured)

This is what "Entity detection" above actually falls through, in order,
stopping at the first one that produces text:

| Tier | When | How |
| --- | --- | --- |
| 0 | Greenhouse / Lever / Ashby / Workday URL | Background script hits that platform's public, unauthenticated JSON API directly — no DOM access, no login needed even on a gated posting page |
| 0b | iCIMS URL | Content script reads the page's own embedded `application/ld+json` JobPosting block — no network call at all |
| 1 | Any host with a previously-picked selector | `document.querySelector(selector)` against the saved selector in `data/site-selectors.json` |
| 2 | Unknown host, no saved selector | Content-side density heuristic — largest paragraph-dense block under `<main>`/`<article>`/a `<div>`, penalizing link-heavy (nav-like) blocks |
| 3 | You click "Pick element manually" | Devtools-style hover-highlight + click-to-lock; derives a durable selector (stable `id` > unique class > unique class-combo > bounded structural path) and saves it for next time |
| 4 | Everything else failed | Whole-page `innerText`, flagged `⚠️ Unverified extraction` in the saved JD file |

Tiers 0/0b never touch the DOM at all — the reason a sign-in-gated posting
still works is that Tier 1–4 extraction runs *inside your already
authenticated tab*, not through a separate headless fetch that would need
your session cookies it doesn't have.

## Install

Two ways to get it, depending on what you want:

- **Just the relay CLI** (you already have the extension, or you're setting
  up a new machine): `npm install -g @ahmad-hosseinimighani/satellite`, or
  run it without installing via `npx @ahmad-hosseinimighani/satellite relay`.
  This gets you the `satellite` command (§ Commands reference) but **not**
  the AI-agent onboarding files (`AGENTS.md`, `.claude/skills/`, etc.) or the
  extension itself — those are project-directory-scoped and only come from
  a full checkout.
- **Full checkout** (onboarding, the extension source, everything): `git
  clone` this repo. This is the only way to get `/satellite` (or its
  equivalent in other AI CLIs) and the unpacked extension.

## Setup (one-time)

**Option A — guided, via an AI coding CLI** (recommended): open this project
directory in Claude Code, Codex, OpenCode, Cursor, or any CLI that reads
`AGENTS.md`, and run the onboarding command — see "AI Agent Commands" below
for the exact invocation per CLI. It'll interview you for your CV and
profile, write `data/cv.md`/`data/profile.md`, and generate `data/brief.md`
itself, in one guided flow.

**Option B — manual**:

1. `cp data/cv.template.md data/cv.md` — fill in your real CV.
2. `cp data/profile.template.md data/profile.md` — fill in archetypes, comp
   floor, location policy, deal-breakers, etc.
3. `satellite brief` (or `node relay/generate-brief.mjs` from a full
   checkout) — spawns a CLI to condense `profile.md` into `data/brief.md`
   (the file the **light** tier reads). Re-run this anytime you've edited
   `profile.md` by hand and want `brief.md` caught up; the extension's
   "teach it something" input keeps both in sync on its own after that.

`data/cv.md`, `data/profile.md`, and `data/brief.md` are gitignored — your
data, never committed.

## Running it

1. **Start the relay**: `satellite relay` (npm install/npx) or `node
   relay/server.mjs` (full checkout) — listens on `http://127.0.0.1:8787` by
   default (`satellite relay --port <n>` to change it), binds localhost
   only. Leave it running in a terminal while you use the extension.
2. **Load the extension**: `chrome://extensions` → enable **Developer mode**
   → **Load unpacked** → select this repo's `extension/` folder → pin it.
   (Requires a full checkout — the npm package doesn't ship the extension,
   see "Install" above.)

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
3. Pick a **tier** (Light/Normal/Ultra), then **Score this page** — see
   "How It Works" above for exactly what each tier reads and does; in short,
   Light is a fast disposable one-liner, Normal is a full saved report,
   Ultra adds company research + a legitimacy read on top of Normal.
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

## AI Agent Commands

satellite isn't Claude-Code-only. `AGENTS.md` at the project root is the
canonical instructions file — the mode-routing table, onboarding steps, and
status logic all live there, once, and every CLI-specific file below just
points to it. Exact invocation depends on how your CLI discovers commands:

| CLI | How to invoke | What it reads |
| --- | --- | --- |
| Claude Code | `/satellite`, `/satellite onboard`, `/satellite status` | `.claude/skills/satellite/SKILL.md` → `AGENTS.md` |
| Cursor | `/satellite` (auto-discovered) | `.cursor/skills/satellite/SKILL.md` → `AGENTS.md` |
| Codex | Say "run satellite onboarding" / "satellite status" — Codex reads `AGENTS.md`/`CODEX.md` in the project root automatically, no slash-command registration needed | `CODEX.md` → `AGENTS.md` |
| OpenCode | Same as Codex | `OPENCODE.md` → `AGENTS.md` |
| Gemini / Antigravity CLI | Same as Codex | `GEMINI.md` → `AGENTS.md` |
| Any other CLI | Point it at `AGENTS.md` directly and ask for "onboarding" or "status" | `AGENTS.md` |

Three modes exist today, same behavior regardless of which CLI runs them:

| Mode | Command / phrasing | What it does |
| --- | --- | --- |
| (default, no argument) | `/satellite` or "run satellite" | Checks `data/profile.md` — unfilled → runs onboarding; already filled → shows status |
| Onboarding | `/satellite onboard` or "run satellite onboarding" | Interviews you for CV + profile (skipping anything already filled), writes `data/cv.md`/`data/profile.md`, generates `data/brief.md`, then tells you the two manual steps left (start the relay, load the extension) |
| Status | `/satellite status` or "satellite status" | Reports which of `cv.md`/`profile.md`/`brief.md` are filled/missing/placeholder, flags a possibly-stale `brief.md`, changes nothing |

More modes (e.g. scoring or relay control from inside a chat session) are
planned but not built — the routing table in `AGENTS.md` is deliberately
left open for them.

## Commands reference

| Command | What it does |
| --- | --- |
| `satellite relay [--port <n>]` (npm) / `node relay/server.mjs` (checkout) | Starts the relay, default port 8787 |
| `satellite brief [cliId]` (npm) / `node relay/generate-brief.mjs [cliId]` (checkout) | One-off: derive `brief.md` from `profile.md`. Optional CLI id (`claude`, `codex`, ...) to force which one; defaults to the first installed |
| `satellite --help` | Usage |

Onboarding/status aren't `satellite` CLI subcommands — they're interactive,
so they only exist as AI-agent commands (table above), not something you'd
run from a plain terminal.

The relay's own HTTP endpoints (for curl-testing or debugging):

| Endpoint | Purpose |
| --- | --- |
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

- **Multi-CLI verified only at the relay/scoring layer, and only for
  `claude`.** The onboarding/status commands route through `AGENTS.md` for
  all seven CLIs `relay/clis.mjs` knows about, but only Claude Code's actual
  slash-command discovery and the relay's `claude -p` invocation (with
  working `--allowedTools`/`--permission-mode` flags) have been exercised
  end-to-end. Codex/OpenCode/Copilot/Qwen/Antigravity/Grok reading
  `AGENTS.md` and running scoring calls through the relay are both
  unverified — the wiring exists, nobody's confirmed it works on those CLIs.
- **npm package not published.** `package.json`/`bin/satellite.mjs` are
  structured and `npm pack --dry-run` produces a clean, dependency-free
  tarball, but nothing's been pushed to the npm registry yet — `npx
  @ahmad-hosseinimighani/satellite` won't resolve until that happens.
- **Extension not submitted to any store.** Chrome Web Store / Firefox AMO
  listings are unpacked-load only for now; packaging for store submission
  (icons need to stop being placeholder circles, a store listing, a
  privacy-practices disclosure given the relay/CLI access) is unstarted.
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
