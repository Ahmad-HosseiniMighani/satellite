# career-ops-lite

Standalone job-scoring browser extension. Scores a posting on the current tab
against your own CV/profile at one of three tiers (light/normal/ultra), no
career-ops checkout required at runtime. See the extension/ and relay/
directories; relay/ is not built yet, so the extension currently falls back
to mock scores when it can't reach `http://127.0.0.1:8787`.

## Load the extension (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**, select this repo's `extension/` folder.
4. Pin the extension for easy access.

## Try it (mock mode — relay not built yet)

1. Open any job posting — try a live Greenhouse/Lever/Ashby/Workday board first
   (e.g. a `boards.greenhouse.io/...` or `jobs.lever.co/...` URL) to see Tier 0
   API-based entity detection.
2. Click the extension icon. It should label the posting ("Greenhouse posting
   — {company}", etc.) and show a **relay down (mock)** badge, since
   `relay/server.mjs` doesn't exist yet.
3. Pick a tier, click **Score this page** — you'll get a clearly-labeled mock
   verdict (real relay wiring is next).
4. On a non-ATS company careers page, the entity label should say "Unknown
   site" and show a **Pick element manually** button — click it, hover the
   page (blue highlight follows the cursor), click the job-description block.
   Re-open the popup and it should show a green confirmation banner.
5. **Save to shortlist** / the **auto-save** checkbox both work in mock mode
   too (relay.js's mock fallback covers `/shortlist` and `/memory`).

## What to watch for while testing

- Service worker errors: `chrome://extensions` → this extension → "service
  worker" link → console.
- Content script errors: regular page DevTools console.
- If the popup shows "Not a job page" on an obvious posting, the site is
  either not on Tier 0's ATS list and needs the picker, or `getState()` is
  seeing a URL scheme it doesn't handle (chrome://, file://, etc. are
  expected to say that).
