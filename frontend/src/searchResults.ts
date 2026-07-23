import type { JobPosting } from "./types";

export function rankJobs(items: JobPosting[]): JobPosting[] {
  return [...items].sort(
    (left, right) => (right.match_score ?? 0) - (left.match_score ?? 0),
  );
}

export function resultsPageForJob(
  jobs: JobPosting[],
  jobId: number,
  pageSize: number | "all",
): number {
  if (pageSize === "all") return 1;
  const index = jobs.findIndex((job) => job.id === jobId);
  return index < 0 ? 1 : Math.floor(index / pageSize) + 1;
}