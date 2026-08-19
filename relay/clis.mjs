// Own multi-CLI detection — same DESIGN as career-ops's web/src/lib/clis.ts
// (find a binary on PATH, build headless argv per CLI) but written from
// scratch.
import { existsSync, accessSync, constants } from "node:fs";
import path from "node:path";

// Headless invocation shape per CLI — mirrors the table career-ops's own
// AGENTS.md documents (kept here as a plain data table, not a shared import).
//
// `args(prompt, opts)` — opts.allowedTools scopes what the spawned agent can
// touch (e.g. "Read" for scoring calls, "Read Edit Write" for the
// memory-edit call). This is a hard boundary: a tool that isn't in the list
// isn't callable, regardless of what a prompt-injected job posting asks for
// — see the plan's security notes. It also fixes a real hang: a headless
// `claude -p` that tries a tool needing approval (Edit/Write) has no
// terminal to approve it when spawned from an HTTP request, so
// opts.needsEdit adds `--permission-mode acceptEdits` (auto-approves file
// edits specifically) only for the calls that legitimately edit files —
// Read-only scoring calls need no override, since Read doesn't prompt.
// Only claude's flags are verified here (the only CLI installed to test
// against); the other six pass just the prompt until someone with that CLI
// installed fills in its equivalents.
const CLI_SPECS = {
  claude: {
    bin: "claude",
    args: (prompt, opts = {}) => {
      const flags = [];
      if (opts.allowedTools) flags.push("--allowedTools", opts.allowedTools);
      if (opts.needsEdit) flags.push("--permission-mode", "acceptEdits");
      return [...flags, "-p", prompt];
    },
  },
  codex: { bin: "codex", args: (prompt) => ["exec", prompt] },
  opencode: { bin: "opencode", args: (prompt) => ["run", prompt] },
  copilot: { bin: "copilot", args: (prompt) => ["-p", prompt] },
  qwen: { bin: "qwen", args: (prompt) => ["-p", prompt] },
  agy: { bin: "agy", args: (prompt) => ["-p", prompt] },
  grok: { bin: "grok", args: (prompt) => ["-p", prompt] },
};

function findBin(bin) {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const full = path.join(dir, bin);
    if (!existsSync(full)) continue;
    try {
      accessSync(full, constants.X_OK);
      return full;
    } catch {
      // exists but not executable — keep looking
    }
  }
  return null;
}

export function resolveCli(id) {
  const spec = CLI_SPECS[id];
  if (!spec) return null;
  const binPath = findBin(spec.bin);
  if (!binPath) return null;
  return { id, binPath, buildArgs: spec.args };
}

export function listAvailableClis() {
  return Object.keys(CLI_SPECS).filter((id) => resolveCli(id) !== null);
}

export function firstAvailableCli() {
  const [id] = listAvailableClis();
  return id ?? null;
}
