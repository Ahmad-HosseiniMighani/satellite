// Greenhouse job-board detection + single-job fetch.
// URL shapes seen in the wild:
//   https://boards.greenhouse.io/{token}/jobs/{id}
//   https://job-boards.greenhouse.io/{token}/jobs/{id}
//   https://job-boards.eu.greenhouse.io/{token}/jobs/{id}
const URL_RE = /^https:\/\/(?:boards|job-boards(?:\.eu)?)\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/;

export function detect(url) {
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { ats: "greenhouse", token: m[1], jobId: m[2] };
}

// The board-list endpoint (boards-api.greenhouse.io/v1/boards/{token}/jobs) is the
// one career-ops's own scanner uses, but that returns every posting on the board —
// wasteful for "the user has one job open." This single-job form is Greenhouse's
// documented content=true variant; verify it stays live if Greenhouse changes shape.
export async function fetchJob(match) {
  const api = `https://boards-api.greenhouse.io/v1/boards/${match.token}/jobs/${match.jobId}?content=true`;
  const res = await fetch(api, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const job = await res.json();
  return {
    title: job.title ?? "",
    company: match.token,
    location: job.location?.name ?? "",
    description: stripHtml(job.content ?? ""),
    url: job.absolute_url ?? "",
  };
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
