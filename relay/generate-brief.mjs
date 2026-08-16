#!/usr/bin/env node
// One-off: derive data/brief.md from a freshly filled data/profile.md.
// (Ongoing updates after that go through the /memory endpoint, which edits
// both files in one pass — this script is just for the first onboarding run,
// or if you hand-edit profile.md heavily and want brief.md caught up.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCli, firstAvailableCli } from "./clis.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_PATH = path.join(ROOT, "data", "profile.md");

if (!fs.existsSync(PROFILE_PATH)) {
  console.error("data/profile.md doesn't exist yet — copy data/profile.template.md there and fill it in first.");
  process.exit(1);
}

const cliId = process.argv[2] || firstAvailableCli();
const cli = cliId ? resolveCli(cliId) : null;
if (!cli) {
  console.error("No CLI available on PATH. Install one of: claude, codex, opencode, copilot, qwen, agy, grok.");
  process.exit(1);
}

const prompt = [
  "Read data/profile.md.",
  "Write data/brief.md as a condensed (~1.5-2K token) version of it, keeping the same section",
  "headings (Identity, Target Archetypes, Proof Points, Comp Strategy, Location Scoring,",
  "Hard DQ Criteria, Soft Red Flags, Priority Override List, Deal-Breakers) but trimmed to only",
  "what changes a go/no-go decision — this file gets re-read on every single light-tier score,",
  "so keep it tight.",
  "Use the Write tool directly on data/brief.md.",
  "When done, output only: BRIEF_UPDATED: done",
].join(" ");

const { spawn } = await import("node:child_process");
const child = spawn(cli.binPath, cli.buildArgs(prompt), { cwd: ROOT, stdio: "inherit" });
child.on("close", (code) => process.exit(code ?? 1));
