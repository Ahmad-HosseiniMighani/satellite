// Own multi-CLI detection — same DESIGN as career-ops's web/src/lib/clis.ts
// (find a binary on PATH, build headless argv per CLI) but written from
// scratch for this project: no import of career-ops code at runtime.
import { existsSync, accessSync, constants } from "node:fs";
import path from "node:path";

// Headless invocation shape per CLI — mirrors the table career-ops's own
// AGENTS.md documents (kept here as a plain data table, not a shared import).
const CLI_SPECS = {
  claude: { bin: "claude", args: (prompt) => ["-p", prompt] },
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
