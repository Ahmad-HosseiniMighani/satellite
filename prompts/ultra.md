# Tier: ultra — Full Score + Company Research

Everything `normal` does, plus a bounded company-research pass and a
lightweight legitimacy read. Heaviest, slowest tier — use it for postings
that already look promising and are worth the extra time.

## Context

Read `data/cv.md` and `data/profile.md` in full, same as `normal`.

## Steps

Do steps 1-6 exactly as specified in `prompts/normal.md` (Role Summary, CV
Match, Level & Strategy, Comp & Demand, Score, Verdict) — read that file and
follow it for those steps. Then add:

7. **Company Research** (bounded — a handful of searches, not an open-ended
   crawl). Cover what's actually findable, skip what isn't rather than
   guessing:
   - What does the company actually do (product/market), in one sentence a
     non-expert would understand?
   - Recent news (funding, layoffs, leadership changes, major
     launches/incidents) in roughly the last 12 months — anything a
     candidate should know before an interview?
   - Engineering/org culture signals if findable (public eng blog, glassdoor
     themes, notable OSS presence) — 1-2 sentences, cite what you found.
   - Likely near-term challenges for someone in this role, inferred from the
     above (not invented).
   - How this candidate's specific background (from `cv.md`) is a good or
     weak angle into this specific company's situation.

8. **Legitimacy read** (lightweight — not a full fraud investigation):
   - Does the posting read as boilerplate/generic vs. genuinely tailored to
     a real team need?
   - Any AI-buzzword-vs-actual-infrastructure mismatch (heavy "AI-powered"
     language with no engineering substance behind it)?
   - Anything about the posting itself (contact info, application flow,
     comp transparency) that reads as unusual for a legitimate employer?
   - If nothing stands out, say so plainly — don't manufacture a concern to
     fill the section.

## Output

Same shape as `normal.md`: full reasoning as prose (now including Company
Research and Legitimacy Read sections), saved as this job's report. End with
the same exact last line:

```text
SCORE: {PASS|MARGINAL|FAIL|SKIP} | {X.X}/5 | {reason, ≤ 25 words}
```

Company research and legitimacy findings inform the score (fold into the
red-flag adjustment or comp/level confidence) but never invent a
disqualifier that isn't grounded in something you actually found.
