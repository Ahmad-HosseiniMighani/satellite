// Ashby job-board detection. URL shape: https://jobs.ashbyhq.com/{org}/{jobId}
const URL_RE = /^https:\/\/jobs\.ashbyhq\.com\/([^/?#]+)\/([^/?#]+)/;

export function detect(url) {
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { ats: "ashby", org: m[1], jobId: m[2] };
}

// Ashby's public board API returns the whole board; there is no confirmed
// single-posting endpoint. Filter client-side, and be honest when the API's
// job object carries no description field — the caller falls back to DOM
// extraction (Tier 2/3) rather than silently capturing an empty JD.
export async function fetchJob(match) {
  const api = `https://api.ashbyhq.com/posting-api/job-board/${match.org}?includeCompensation=true`;
  const res = await fetch(api, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const board = await res.json();
  const job = (board.jobs ?? []).find((j) => j.id === match.jobId || j.jobId === match.jobId);
  if (!job) return null;
  const description = job.descriptionPlain ?? job.descriptionHtml ?? "";
  if (!description) return { needsDomFallback: true, title: job.title ?? "", company: match.org };
  return {
    title: job.title ?? "",
    company: match.org,
    location: job.location ?? job.address?.postalAddress?.addressLocality ?? "",
    description: description.replace(/<[^>]+>/g, ""),
    url: job.jobUrl ?? job.applyUrl ?? "",
  };
}
