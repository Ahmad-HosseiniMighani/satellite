// Workday job-board detection. URL shape:
//   https://{tenant}.{instance}.myworkdayjobs.com/[{xx-XX}/]{site}/job/{externalPath...}
const URL_RE =
  /^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)\/job\/(.+?)\/?(?:[?#]|$)/;

export function detect(url) {
  const m = URL_RE.exec(url);
  if (!m) return null;
  return { ats: "workday", tenant: m[1], instance: m[2], site: m[3], externalPath: m[4] };
}

// Single-job POST — avoids paginating a tenant's full (sometimes 17k+) job list
// just to find the one posting already open in the tab.
export async function fetchJob(match) {
  const api = `https://${match.tenant}.${match.instance}.myworkdayjobs.com/wday/cxs/${match.tenant}/${match.site}/job/${match.externalPath}`;
  const res = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: "{}",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const posting = data.jobPostingInfo ?? {};
  return {
    title: posting.title ?? "",
    company: match.tenant,
    location: posting.location ?? posting.locationsText ?? "",
    description: (posting.jobDescription ?? "").replace(/<[^>]+>/g, ""),
    url: posting.externalUrl ?? "",
  };
}
