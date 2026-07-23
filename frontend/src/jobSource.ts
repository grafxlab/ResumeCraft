const JOB_SOURCE_HOSTS: [string, string][] = [
  ["linkedin.com", "LinkedIn"],
  ["indeed.com", "Indeed"],
  ["glassdoor.com", "Glassdoor"],
  ["ziprecruiter.com", "ZipRecruiter"],
  ["monster.com", "Monster"],
  ["dice.com", "Dice"],
  ["wellfound.com", "Wellfound"],
  ["usajobs.gov", "USAJobs"],
  ["simplyhired.com", "SimplyHired"],
];

export function inferJobSource(url: string): string | null {
  const value = url.trim();
  if (!value) return null;
  try {
    const hostname = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`,
    ).hostname.toLowerCase().replace(/^www\./, "");
    return JOB_SOURCE_HOSTS.find(([domain]) =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    )?.[1] ?? null;
  } catch {
    return null;
  }
}