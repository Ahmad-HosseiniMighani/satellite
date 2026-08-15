// iCIMS has no public JSON API (confirmed against career-ops's own scanner, which
// resorts to scraping hosted search-result pages for this platform). For a
// single already-open posting the cheapest source is the JobPosting JSON-LD
// block iCIMS already embeds in the rendered page — no network fetch needed,
// which is why this is "Tier 0b": detection lives here, but extraction happens
// in the content script (content/extractor.js reads the script tag), not via
// a background fetchJob like the other four providers.
const HOST_SUFFIX = ".icims.com";

export function detect(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!parsed.hostname.endsWith(HOST_SUFFIX)) return null;
  return { ats: "icims", tier: "0b" };
}
