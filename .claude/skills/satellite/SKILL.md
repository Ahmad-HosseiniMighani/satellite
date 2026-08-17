---
name: satellite
description: Standalone job-scoring extension command center -- onboarding (CV/profile/brief), status, setup guidance.
arguments: mode
user_invocable: true
user-invocable: true
argument-hint: "[onboard | status]"
license: MIT
---

# satellite -- Command Center

satellite is a standalone browser extension + local relay that scores job postings against your own CV and deal-breakers. This skill is its onboarding and status entrypoint, run from inside this project directory. It never touches the career-ops repo — everything it reads/writes lives under this project's own `data/`.

## Mode Routing

Determine the mode from `$mode`:

| Input | Mode |
|-------|------|
| (empty / no args) | Check state (see "State check" below): unfilled `data/profile.md` → **onboarding**. Otherwise → **status**. |
| `onboard` | **onboarding** — runs regardless of current state; re-run anytime to fill in what's missing or redo something. |
| `status` | **status** — reports current setup, touches nothing. |

No other modes exist yet. This table is intentionally left open for what comes next (e.g. a future scoring or relay-control mode) — don't invent one now.

## State Check

A file counts as "filled" if it exists and has no `{...}`-style placeholder text left in it (that pattern only appears in the shipped `.template.md` files and in a copy nobody's edited yet). Check, in order:

1. `data/cv.md` — missing, placeholder, or filled?
2. `data/profile.md` — missing, placeholder, or filled?
3. `data/brief.md` — missing, or does its mtime predate `data/profile.md`'s mtime (possibly stale)?

## Onboarding Mode

Walk through these steps **in order**, but **skip any step whose target is already filled** — this makes onboarding safe to re-run, not a one-shot. If the user explicitly asks to redo a filled step anyway (e.g. "let's redo my profile"), do that step regardless of its current state.

### 1. CV (`data/cv.md`)

If missing or still a placeholder, ask:

> "I don't have your CV yet. You can either:
> 1. Paste your CV here and I'll convert it to markdown
> 2. Paste your LinkedIn URL and I'll extract the key info
> 3. Tell me about your experience and I'll draft one for you
>
> Which do you prefer?"

Write `data/cv.md` from whatever they give you. Use `data/cv.template.md`'s section shape (Summary / Experience / Projects / Education / Skills) as the structure — not its placeholder text as content. Never invent facts the user didn't give you.

### 2. Profile (`data/profile.md`)

If missing or still a placeholder, ask for:
- Target archetypes / roles (what they're actually applying for)
- Comp floor and any conditions (e.g. "$150k, but only if fully remote")
- Location policy (remote/hybrid/on-site tolerance, relocation, travel limits)
- Hard dealbreakers (instant no's — clearance requirements they lack, domains they won't touch, etc.)
- Soft red flags (things that dock a score but aren't disqualifying)
- Any companies that should always pass regardless of score (priority override)
- 2-3 strongest proof points — quantified accomplishments worth leading with

Write `data/profile.md` using **exactly** `data/profile.template.md`'s section headings (Identity, Target Archetypes, Proof Points, Comp Strategy, Location Scoring, Hard DQ Criteria, Soft Red Flags, Priority Override List, Deal-Breakers) — `prompts/normal.md` and `prompts/ultra.md` expect this structure when they read it later, so don't improvise different headings.

### 3. Brief (`data/brief.md`)

Whenever `profile.md` was just written or changed in this session, regenerate `data/brief.md` yourself, directly, with the Write tool — don't shell out to `relay/generate-brief.mjs` for this; that script exists for headless regeneration after someone hand-edits `profile.md` outside a session, not for when you're already sitting here with Read/Write access.

Condense `profile.md` to roughly 1.5-2K tokens, same section headings, keeping only what actually changes a go/no-go decision (this is what the **light** scoring tier reads instead of the full profile — see `prompts/light.md` if you want the exact contract it expects).

### 4. Hand off

Once CV, profile, and brief are all filled, tell the user setup's done and give the two steps satellite can't do for them:

> "You're set up. Two things left, both outside what I can do from here:
> 1. Start the relay: `node relay/server.mjs` (leave it running in a terminal)
> 2. Load the extension: `chrome://extensions` → enable Developer mode → Load unpacked → select this project's `extension/` folder
>
> After that, click the extension icon on any job posting. Run `/satellite status` anytime to check where things stand."

## Status Mode

Report the state check results plainly — present & filled / present but placeholder / missing for each of `cv.md`/`profile.md`/`brief.md`, and the stale-brief flag if `profile.md` is newer than `brief.md`. Change nothing.

Always end with the same relay/extension reminder from the onboarding hand-off (Step 4) — status mode has no way to know if those are already running, so repeat it regardless of file state.

If everything's missing, suggest `/satellite onboard` instead of just listing gaps.
