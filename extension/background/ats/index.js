import * as greenhouse from "./greenhouse.js";
import * as lever from "./lever.js";
import * as ashby from "./ashby.js";
import * as workday from "./workday.js";
import * as icims from "./icims.js";

// First provider whose detect() matches wins.
const PROVIDERS = [greenhouse, lever, ashby, workday, icims];

// Returns null (no known ATS — caller falls through to Tier 1-4 DOM capture)
// or { ats, ...matchFields, fetchJob? }. icims has no fetchJob (Tier 0b, see
// icims.js) — callers must check for its presence before calling it.
export function detectAts(url) {
  for (const provider of PROVIDERS) {
    const match = provider.detect(url);
    if (match) return { ...match, fetchJob: provider.fetchJob };
  }
  return null;
}
