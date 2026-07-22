import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Profile } from "../types";
import Spinner from "./Spinner";

interface Props {
  profile: Profile | null;
  onSaved: (p: Profile) => void;
}

export default function ProfileTab({ profile, onSaved }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("[]");
  const [education, setEducation] = useState("[]");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const applyData = (data: Partial<Profile>) => {
    if (data.full_name != null) setFullName(data.full_name);
    if (data.email != null) setEmail(data.email);
    if (data.phone != null) setPhone(data.phone);
    if (data.location != null) setLocation(data.location);
    if (data.summary != null) setSummary(data.summary);
    if (data.skills != null) setSkills(data.skills.join(", "));
    if (data.experience != null)
      setExperience(JSON.stringify(data.experience, null, 2));
    if (data.education != null)
      setEducation(JSON.stringify(data.education, null, 2));
    if (data.links != null) setLinks(data.links);
  };

  useEffect(() => {
    if (!profile) return;
    applyData(profile);
  }, [profile]);

  const importResume = async (file: File) => {
    setError(null);
    setNotice(null);
    setImporting(true);
    try {
      const parsed = await api.parseResume(file);
      applyData(parsed);
      setNotice(
        "Resume imported. Review the fields below, then Save to store it.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const payload = {
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        location: location || null,
        summary: summary || null,
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experience: JSON.parse(experience || "[]"),
        education: JSON.parse(education || "[]"),
        links: { ...(profile?.links ?? {}), ...links },
      };
      const saved = profile
        ? await api.updateProfile(profile.id, payload)
        : await api.createProfile(payload);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <h2>Master profile</h2>
      <p className="meta">
        This is the single source of truth used to tailor every resume and cover
        letter. Documents are generated only from what you enter here.
      </p>

      <div
        className="panel"
        style={{ background: "var(--bg)", marginBottom: 16 }}
      >
        <strong>Import from an existing resume</strong>
        <p className="meta">
          Upload a PDF, DOCX, or TXT resume and AI will extract the fields for
          you to review.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          disabled={importing}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importResume(f);
          }}
        />
        {importing && (
          <p className="meta">
            <Spinner label="Extracting with AI…" />
          </p>
        )}
        {notice && <p className="meta" style={{ color: "var(--accent-2)" }}>{notice}</p>}
      </div>

      <div className="row">
        <div>
          <label>Full name</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div>
          <label>Phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label>Location</label>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
      </div>
      <label>Professional summary</label>
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
      <label>Skills (comma-separated)</label>
      <textarea value={skills} onChange={(e) => setSkills(e.target.value)} />
      <label>Experience (JSON array)</label>
      <textarea
        value={experience}
        onChange={(e) => setExperience(e.target.value)}
        style={{ minHeight: 140 }}
      />
      <label>Education (JSON array)</label>
      <textarea value={education} onChange={(e) => setEducation(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn" onClick={save} disabled={saving || !fullName}>
          {saving ? "Saving…" : profile ? "Update profile" : "Create profile"}
        </button>
      </div>
    </div>
  );
}
