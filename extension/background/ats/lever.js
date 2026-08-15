// Lever job-board detection + single-posting fetch.
// URL shapes: https://jobs.lever.co/{company}/{postingId}, https://jobs.eu.lever.co/{company}/{postingId}
const URL_RE = /^https:\/\/jobs\.((?:eu\.)?lever\.co)\/([^/?#]+)\/([^/?#]+)/;

export function detect(url) {
  const m = URL_RE.exec(url);
  if (!m) return null;
  const apiHost = m[1] === "eu.lever.co" ? "api.eu.lever.co" : "api.lever.co";
  return { ats: "lever", apiHost, company: m[2], postingId: m[3] };
}

export async function fetchJob(match) {
  const api = `https://${match.apiHost}/v0/postings/${match.company}/${match.postingId}?mode=json`;
  const res = await fetch(api, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const job = await res.json();
  return {
    title: job.text ?? "",
    company: match.company,
    location: job.categories?.location ?? "",
    description: [job.descriptionPlain, job.lists?.map((l) => `${l.text}\n${l.content}`).join("\n\n")]
      .filter(Boolean)
      .join("\n\n"),
    url: job.hostedUrl ?? "",
  };
}
