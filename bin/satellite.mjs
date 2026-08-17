#!/usr/bin/env node
// npm/npx entrypoint. Thin dispatcher only — the actual logic lives in
// relay/server.mjs and relay/generate-brief.mjs, both of which already
// self-execute on import (relay/server.mjs calls server.listen() at module
// scope, generate-brief.mjs runs its one-shot flow and exits), so this file
// just picks which one to load.
const [, , cmd, ...rest] = process.argv;

const USAGE = `satellite -- standalone job-scoring extension

Usage:
  satellite relay [--port <n>]   Start the local relay (default port 8787)
  satellite brief [cliId]        One-off: derive data/brief.md from data/profile.md
  satellite --help               Show this message

Onboarding (CV/profile/brief) isn't a CLI command — it's interactive, run
from inside an AI coding session in this project directory (Claude Code:
/satellite, or just ask "run satellite onboarding" in any AI CLI that reads
AGENTS.md). See README.md.
`;

function fail(msg) {
  process.stderr.write(`satellite: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

async function main() {
  if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
    process.stdout.write(USAGE);
    return;
  }

  if (cmd === "relay") {
    const portFlagIdx = rest.indexOf("--port");
    if (portFlagIdx !== -1 && rest[portFlagIdx + 1]) {
      process.env.PORT = rest[portFlagIdx + 1];
    }
    await import(new URL("../relay/server.mjs", import.meta.url));
    return;
  }

  if (cmd === "brief") {
    if (rest[0]) process.argv[2] = rest[0]; // generate-brief.mjs reads an optional cliId from argv[2]
    await import(new URL("../relay/generate-brief.mjs", import.meta.url));
    return;
  }

  fail(`unknown command "${cmd}"`);
}

main();
