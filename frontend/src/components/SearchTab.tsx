import { useEffect, useState } from "react";
import { api } from "../api";
import { matchStyle } from "../match";
import type { Document, JobPosting, Profile } from "../types";
import DocumentEditor from "./DocumentEditor";
import Spinner from "./Spinner";

interface Props {
  profile: Profile | null;
  onOpenApplication: (jobId: number) => void;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export default function SearchTab({ profile, onOpenApplication }: Props) {
  const [query, setQuery] = useState(
    () => localStorage.getItem("search.query") ?? "",
  );
  const [location, setLocation] = useState(
    () => localStorage.getItem("search.location") ?? "",
  );
  const [sources, setSources] = useState<string[]>(["adzuna", "jsearch"]);
  const [available, setAvailable] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyJob, setBusyJob] = useState<number | null>(null);
  const [docs, setDocs] = useState<Record<number, Document[]>>({});
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [trackedJobIds, setTrackedJobIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    localStorage.setItem("search.query", query);
  }, [query]);

  useEffect(() => {
    localStorage.setItem("search.location", location);
  }, [location]);

  // Restore cached results (valid for 24h). Results only refresh on Search.
  useEffect(() => {
    const raw = localStorage.getItem("search.results");
    if (!raw) return;
    try {
      const cache = JSON.parse(raw) as { ts: number; jobs: JobPosting[] };
      if (Date.now() - cache.ts < CACHE_TTL_MS) {
        setJobs(cache.jobs);
        setCachedAt(cache.ts);
      } else {
        localStorage.removeItem("search.results");
      }
    } catch {
      localStorage.removeItem("search.results");
    }
  }, []);

  useEffect(() => {
    api
      .sources()
      .then((r) => setAvailable(r.available))
      .catch(() => setAvailable([]));
  }, []);

  // Load which jobs are already tracked so their buttons show as "Tracked".
  useEffect(() => {
    api
      .listApplications()
      .then((apps) => setTrackedJobIds(new Set(apps.map((a) => a.job_id))))
      .catch(() => {
        /* ignore */
      });
  }, []);

  const search = async () => {
    setError(null);
    setLoading(true);
    try {
      const results = await api.searchJobs(
        { query, location: location || undefined, sources },
        profile?.id,
      );
      setJobs(results);
      const ts = Date.now();
      setCachedAt(ts);
      localStorage.setItem(
        "search.results",
        JSON.stringify({ ts, jobs: results }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (name: string) => {
    setSources((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const generate = async (job: JobPosting, kind: "resume" | "cover") => {
    if (!profile) {
      setError("Create a profile first.");
      return;
    }
    setBusyJob(job.id);
    setError(null);
    try {
      const doc =
        kind === "resume"
          ? await api.generateResume(job.id, profile.id)
          : await api.generateCoverLetter(job.id, profile.id);
      setDocs((prev) => ({
        ...prev,
        [job.id]: [...(prev[job.id] ?? []), doc],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyJob(null);
    }
  };

  const track = async (job: JobPosting) => {
    setBusyJob(job.id);
    setError(null);
    try {
      const jobDocs = docs[job.id] ?? [];
      const resume = jobDocs.find((d) => d.type === "resume");
      const cover = jobDocs.find((d) => d.type === "cover_letter");
      await api.createApplication({
        job_id: job.id,
        resume_document_id: resume?.id,
        cover_letter_document_id: cover?.id,
        status: "draft",
      });
      setTrackedJobIds((prev) => new Set(prev).add(job.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyJob(null);
    }
  };

  const dismiss = (jobId: number) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== jobId);
      // Keep the cached results in sync so it stays dismissed on reload.
      if (cachedAt) {
        localStorage.setItem(
          "search.results",
          JSON.stringify({ ts: cachedAt, jobs: next }),
        );
      }
      return next;
    });
  };

  return (
    <div>
      <div className="panel">
        <h2>Search Job Boards</h2>
        <div className="row">
          <div style={{ flex: 2 }}>
            <label>Role / keywords</label>
            <div className="input-clear">
              <input
                value={query}
                placeholder="e.g. senior python engineer"
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="clear-btn"
                  aria-label="Clear role / keywords"
                  onClick={() => setQuery("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div>
            <label>Location</label>
            <div className="input-clear">
              <input
                value={location}
                placeholder="e.g. Remote, Chicago"
                onChange={(e) => setLocation(e.target.value)}
              />
              {location && (
                <button
                  type="button"
                  className="clear-btn"
                  aria-label="Clear location"
                  onClick={() => setLocation("")}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>
        <label>Sources</label>
        <div style={{ display: "flex", gap: 16, margin: "4px 0 12px" }}>
          {["adzuna", "jsearch"].map((s) => (
            <label
              key={s}
              style={{ display: "flex", gap: 6, alignItems: "center" }}
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={sources.includes(s)}
                onChange={() => toggleSource(s)}
              />
              {s}
              {!available.includes(s) && (
                <span className="meta">(no API key)</span>
              )}
            </label>
          ))}
        </div>
        <button className="btn" onClick={search} disabled={loading || !query}>
          {loading ? <Spinner label="Searching…" /> : "Search"}
        </button>
        {cachedAt && !loading && (
          <span className="meta" style={{ marginLeft: 10 }}>
            Showing cached results from {new Date(cachedAt).toLocaleString()} ·
            click Search to refresh
          </span>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {loading && jobs.length === 0 && (
        <div className="panel">
          <Spinner size="lg" label="Searching job boards…" block />
        </div>
      )}

      {jobs.map((job) => (
        <div className="job" key={job.id}>
          <div className="title">{job.title}</div>
          <div className="meta">
            {job.company ?? "Unknown company"} · {job.location ?? "—"} ·{" "}
            <a href={job.url} target="_blank" rel="noreferrer">
              view posting
            </a>
          </div>
          <div>
            <span className="badge">{job.source}</span>
            {job.match_score != null && (
              <span className="badge score" style={matchStyle(job.match_score)}>
                match {job.match_score}
              </span>
            )}
            <span className="badge">{job.status}</span>
          </div>
          {job.match_notes && <p className="meta">{job.match_notes}</p>}
          <div className="actions">
            <button
              className="btn secondary"
              disabled={busyJob === job.id}
              onClick={() => generate(job, "resume")}
            >
              {busyJob === job.id ? (
                <Spinner label="Generating…" />
              ) : (
                "Generate resume"
              )}
            </button>
            <button
              className="btn secondary"
              disabled={busyJob === job.id}
              onClick={() => generate(job, "cover")}
            >
              {busyJob === job.id ? (
                <Spinner label="Generating…" />
              ) : (
                "Generate cover letter"
              )}
            </button>
            {trackedJobIds.has(job.id) ? (
              <button
                className="btn"
                style={{ background: "var(--accent-2)", color: "#06280f" }}
                onClick={() => onOpenApplication(job.id)}
              >
                ✓ Tracked
              </button>
            ) : (
              <button
                className="btn"
                disabled={busyJob === job.id}
                onClick={() => track(job)}
              >
                Track application
              </button>
            )}
            <button
              className="btn secondary"
              title="Remove from results"
              onClick={() => dismiss(job.id)}
            >
              Dismiss
            </button>
          </div>
          {(docs[job.id] ?? []).map((d) => (
            <DocumentEditor
              key={d.id}
              doc={d}
              profileId={profile?.id}
              onChange={(updated) =>
                setDocs((prev) => ({
                  ...prev,
                  [job.id]: (prev[job.id] ?? []).map((x) =>
                    x.id === updated.id ? updated : x,
                  ),
                }))
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}
