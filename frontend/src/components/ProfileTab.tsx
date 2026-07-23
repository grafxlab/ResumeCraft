import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { IgnoredWord, Profile, ResumeTemplate, TextLinkItem } from "../types";
import Spinner from "./Spinner";
import PlaceholderHelp from "./PlaceholderHelp";
import TextLinkField from "./TextLinkField";
import TextLinkList from "./TextLinkList";

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
  const [additionalInformationItems, setAdditionalInformationItems] = useState<TextLinkItem[]>([]);
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState("[]");
  const [education, setEducation] = useState("[]");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUpdatedDialog, setShowUpdatedDialog] = useState(false);
  const [ignoredWords, setIgnoredWords] = useState<IgnoredWord[]>([]);
  const [unignoringWord, setUnignoringWord] = useState<string | null>(null);
  const [ignoredKeywordsExpanded, setIgnoredKeywordsExpanded] = useState(
    () => localStorage.getItem("profile.ignoredKeywordsExpanded") !== "false",
  );
  const [legacyLinks, setLegacyLinks] = useState<Record<string, string>>({});
  const [profileLinkItems, setProfileLinkItems] = useState<TextLinkItem[]>([]);
  const [resumeTemplates, setResumeTemplates] = useState<ResumeTemplate[]>([]);
  const [coverLetterTemplates, setCoverLetterTemplates] = useState<ResumeTemplate[]>([]);
  const [resumeTemplateId, setResumeTemplateId] = useState<number | null>(null);
  const [coverLetterTemplateId, setCoverLetterTemplateId] = useState<number | null>(null);
  const [templatesExpanded, setTemplatesExpanded] = useState(
    () => localStorage.getItem("profile.templatesExpanded") !== "false",
  );
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const templateFileRef = useRef<HTMLInputElement>(null);
  const coverLetterTemplateFileRef = useRef<HTMLInputElement>(null);

  const applyData = (data: Partial<Profile>) => {
    if (data.full_name != null) setFullName(data.full_name);
    if (data.email != null) setEmail(data.email);
    if (data.phone != null) setPhone(data.phone);
    if (data.location != null) setLocation(data.location);
    if (data.summary != null) setSummary(data.summary);
    if (data.additional_information_items?.length) {
      setAdditionalInformationItems(data.additional_information_items);
    } else if (data.additional_information) {
      setAdditionalInformationItems([{ text: data.additional_information, link: "" }]);
    } else if (data.additional_information_items != null) {
      setAdditionalInformationItems([]);
    }
    if (data.skills != null) setSkills(data.skills.join(", "));
    if (data.experience != null)
      setExperience(JSON.stringify(data.experience, null, 2));
    if (data.education != null)
      setEducation(JSON.stringify(data.education, null, 2));
    if (data.links != null) setLegacyLinks(data.links);
    if (data.profile_link_items != null) {
      setProfileLinkItems(
        data.profile_link_items.map((item) => ({
          ...item,
          kind: item.kind ?? (
            item.text.trim().toLowerCase() === "linkedin"
              ? "linkedin"
              : item.text.trim().toLowerCase() === "website"
                ? "website"
                : undefined
          ),
        })),
      );
    }
    if (data.resume_template_id !== undefined) {
      setResumeTemplateId(data.resume_template_id);
    }
    if (data.cover_letter_template_id !== undefined) {
      setCoverLetterTemplateId(data.cover_letter_template_id);
    }
  };

  useEffect(() => {
    if (!profile) return;
    applyData(profile);
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      setIgnoredWords([]);
      return;
    }
    api.listIgnoredWords(profile.id).then(setIgnoredWords).catch(() => {
      setIgnoredWords([]);
    });
  }, [profile]);

  useEffect(() => {
    api.listResumeTemplates("resume").then(setResumeTemplates).catch(() => setResumeTemplates([]));
    api.listResumeTemplates("cover_letter").then(setCoverLetterTemplates).catch(() => setCoverLetterTemplates([]));
  }, []);

  const unignoreWord = async (word: string) => {
    if (!profile) return;
    setUnignoringWord(word);
    try {
      await api.unignoreWord(profile.id, word);
      setIgnoredWords((current) => current.filter((item) => item.word !== word));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUnignoringWord(null);
    }
  };

  const toggleIgnoredKeywords = () => {
    setIgnoredKeywordsExpanded((expanded) => {
      const next = !expanded;
      localStorage.setItem("profile.ignoredKeywordsExpanded", String(next));
      return next;
    });
  };

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

  const uploadTemplate = async (
    file: File | undefined,
    documentType: "resume" | "cover_letter",
  ) => {
    if (!file) return;
    if (!/\.(html?|md|txt)$/i.test(file.name)) {
      setError("Upload an HTML, Markdown, or text template.");
      return;
    }
    if (file.size > 250_000) {
      setError("Template files must be 250 KB or smaller.");
      return;
    }
    setUploadingTemplate(true);
    setError(null);
    try {
      const content = await file.text();
      const placeholders = new Set(
        [...content.matchAll(/{{\s*([A-Z][A-Z0-9_]*)\s*}}/g)].map(
          (match) => match[1],
        ),
      );
      const supported = (documentType === "resume"
        ? ["FULL_NAME", "PROFESSIONAL_HEADLINE", "EMAIL", "PHONE", "LOCATION", "OVERVIEW", "SKILL", "JOB_TITLE", "COMPANY", "EMPLOYMENT_DATES", "EMPLOYMENT_ACHIEVEMENT", "DEGREE_OR_CREDENTIAL", "INSTITUTION", "ADDITIONAL_LABEL", "ADDITIONAL_URL", "ADDITIONAL_URL_LABEL"]
        : ["FULL_NAME", "EMAIL", "PHONE", "LOCATION", "DATE", "RECIPIENT_NAME", "COMPANY", "SALUTATION", "CLOSING", "LETTER_BODY", "DOCUMENT_CONTENT"]
      ).filter((placeholder) => placeholders.has(placeholder));
      if (supported.length < 3) {
        throw new Error(
          "Templates need at least three supported placeholders for the selected document type.",
        );
      }
      const name = file.name.replace(/\.(html?|md|txt)$/i, "") || "Document template";
      const template = await api.createResumeTemplate(name, content, documentType);
      if (documentType === "resume") {
        setResumeTemplates((current) => [template, ...current]);
        setResumeTemplateId(template.id);
      } else {
        setCoverLetterTemplates((current) => [template, ...current]);
        setCoverLetterTemplateId(template.id);
      }
      if (profile) {
        const updated = await api.updateProfileTemplate(profile.id, template.id, documentType);
        onSaved(updated);
        setNotice(`${template.name} is now your default ${documentType === "resume" ? "resume" : "cover letter"} template.`);
      } else {
        setNotice(`Template uploaded. Create your profile to use ${template.name} by default.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingTemplate(false);
      const fileInput = documentType === "resume" ? templateFileRef : coverLetterTemplateFileRef;
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const selectTemplate = async (
    templateId: number | null,
    documentType: "resume" | "cover_letter",
  ) => {
    if (documentType === "resume") setResumeTemplateId(templateId);
    else setCoverLetterTemplateId(templateId);
    if (!profile) return;
    setError(null);
    try {
      const updated = await api.updateProfileTemplate(profile.id, templateId, documentType);
      onSaved(updated);
      setNotice(
        templateId == null
          ? `Default ${documentType === "resume" ? "resume" : "cover letter"} template restored.`
          : `Default ${documentType === "resume" ? "resume" : "cover letter"} template updated.`,
      );
    } catch (e) {
      if (documentType === "resume") setResumeTemplateId(profile.resume_template_id);
      else setCoverLetterTemplateId(profile.cover_letter_template_id);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const profileLink = (kind: "linkedin" | "website") =>
    profileLinkItems.find((item) => item.kind === kind) ?? null;

  const saveProfileLink = (
    kind: "linkedin" | "website",
    item: TextLinkItem | null,
  ) => {
    setProfileLinkItems((items) => {
      const withoutCurrent = items.filter((current) => current.kind !== kind);
      return item ? [...withoutCurrent, { ...item, kind }] : withoutCurrent;
    });
  };

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const profileLinks = Object.fromEntries(
        profileLinkItems
          .filter((item) => item.link)
          .map((item, index) => {
            const normalized = item.text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
            const key = item.kind === "linkedin"
              ? "linkedin"
              : item.kind === "website"
                ? "portfolio"
                : normalized || `link_${index + 1}`;
            return [key, item.link];
          }),
      );
      const payload = {
        full_name: fullName,
        email: email || null,
        phone: phone || null,
        location: location || null,
        summary: summary || null,
        additional_information: additionalInformationItems.map((item) => item.text).join("\n") || null,
        additional_information_items: additionalInformationItems,
        skills: skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experience: JSON.parse(experience || "[]"),
        education: JSON.parse(education || "[]"),
        links: { ...legacyLinks, ...profileLinks },
        profile_link_items: profileLinkItems,
        resume_template_id: resumeTemplateId,
        cover_letter_template_id: coverLetterTemplateId,
      };
      const saved = profile
        ? await api.updateProfile(profile.id, payload)
        : await api.createProfile(payload);
      onSaved(saved);
      setShowUpdatedDialog(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      {showUpdatedDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShowUpdatedDialog(false)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resume-updated-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="resume-updated-title">Resume Updated</strong>
              <button
                className="btn secondary"
                onClick={() => setShowUpdatedDialog(false)}
              >
                Close
              </button>
            </div>
            <p className="meta">Your profile changes have been saved.</p>
          </div>
        </div>
      )}
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
          <div className="field-label"><label>Full name</label><PlaceholderHelp placeholders={["FULL_NAME"]} /></div>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <div className="field-label"><label>Email</label><PlaceholderHelp placeholders={["EMAIL"]} /></div>
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div>
          <div className="field-label"><label>Phone</label><PlaceholderHelp placeholders={["PHONE"]} /></div>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          <TextLinkField
            label="LinkedIn"
            value={profileLink("linkedin")}
            onChange={(item) => saveProfileLink("linkedin", item)}
            placeholders={["LINKEDIN_LABEL", "LINKEDIN_URL"]}
          />
        </div>
        <div>
          <div className="field-label"><label>Location</label><PlaceholderHelp placeholders={["LOCATION"]} /></div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} />
          <TextLinkField
            label="Website"
            value={profileLink("website")}
            onChange={(item) => saveProfileLink("website", item)}
            placeholders={["PORTFOLIO_LABEL", "PORTFOLIO_URL"]}
          />
        </div>
      </div>
      <div className="field-label"><label>Professional summary</label><PlaceholderHelp placeholders={["OVERVIEW"]} /></div>
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
      <div className="field-label"><label>Skills (comma-separated)</label><PlaceholderHelp placeholders={["SKILL"]} /></div>
      <textarea value={skills} onChange={(e) => setSkills(e.target.value)} />
      <div className="field-label"><label>Experience (JSON array)</label><PlaceholderHelp placeholders={["JOB_TITLE", "COMPANY", "JOB_LOCATION", "EMPLOYMENT_DATES", "EMPLOYMENT_ACHIEVEMENT"]} /></div>
      <textarea
        value={experience}
        onChange={(e) => setExperience(e.target.value)}
        style={{ minHeight: 140 }}
      />
      <div className="field-label"><label>Education (JSON array)</label><PlaceholderHelp placeholders={["DEGREE_OR_CREDENTIAL", "INSTITUTION", "EDUCATION_DATES", "EDUCATION_LOCATION", "EDUCATION_DETAILS"]} /></div>
      <textarea value={education} onChange={(e) => setEducation(e.target.value)} />
      <TextLinkList
        label="Additional information"
        value={additionalInformationItems}
        onChange={setAdditionalInformationItems}
        placeholders={["ADDITIONAL_LABEL", "ADDITIONAL_URL"]}
      />
      <div
        className="panel profile-template"
        style={{ background: "var(--bg)", marginTop: 16, marginBottom: 0 }}
      >
        <button
          className="section-toggle"
          aria-expanded={templatesExpanded}
          onClick={() => setTemplatesExpanded((expanded) => {
            const next = !expanded;
            localStorage.setItem("profile.templatesExpanded", String(next));
            return next;
          })}
        >
          <strong>Templates</strong>
          <span aria-hidden="true">{templatesExpanded ? "Hide" : "Show"}</span>
        </button>
        {templatesExpanded && (
          <>
            <p className="meta">Select a default or upload a custom template for each document type.</p>
            <label>Resume template</label>
            <div className="profile-template-controls">
              <select
                aria-label="Default resume template"
                value={resumeTemplateId ?? ""}
                onChange={(event) => void selectTemplate(
                  event.target.value ? Number(event.target.value) : null,
                  "resume",
                )}
              >
                <option value="">Default resume template</option>
                {resumeTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
              <label className="btn secondary template-upload">
                {uploadingTemplate ? "Uploading..." : "Upload resume template"}
                <input
                  ref={templateFileRef}
                  type="file"
                  accept=".html,.htm,.md,.txt,text/html,text/plain,text/markdown"
                  disabled={uploadingTemplate}
                  onChange={(event) => void uploadTemplate(event.target.files?.[0], "resume")}
                />
              </label>
            </div>
            <label>Cover letter template</label>
            <div className="profile-template-controls">
              <select
                aria-label="Default cover letter template"
                value={coverLetterTemplateId ?? ""}
                onChange={(event) => void selectTemplate(
                  event.target.value ? Number(event.target.value) : null,
                  "cover_letter",
                )}
              >
                <option value="">Default cover letter template</option>
                {coverLetterTemplates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </select>
              <label className="btn secondary template-upload">
                {uploadingTemplate ? "Uploading..." : "Upload cover letter template"}
                <input
                  ref={coverLetterTemplateFileRef}
                  type="file"
                  accept=".html,.htm,.md,.txt,text/html,text/plain,text/markdown"
                  disabled={uploadingTemplate}
                  onChange={(event) => void uploadTemplate(event.target.files?.[0], "cover_letter")}
                />
              </label>
            </div>
          </>
        )}
      </div>
      {profile && (
        <div
          className="panel"
          style={{ background: "var(--bg)", marginTop: 16, marginBottom: 0 }}
        >
          <button
            className="section-toggle"
            aria-expanded={ignoredKeywordsExpanded}
            onClick={toggleIgnoredKeywords}
          >
            <strong>Ignored Keywords</strong>
            <span aria-hidden="true">{ignoredKeywordsExpanded ? "Hide" : "Show"}</span>
          </button>
          {ignoredKeywordsExpanded && (
            ignoredWords.length === 0 ? (
              <p className="meta">No ignored keywords.</p>
            ) : (
              <div className="actions" style={{ marginTop: 10 }}>
                {ignoredWords.map((item) => (
                  <button
                    key={item.id}
                    className="btn secondary ignored-keyword"
                    disabled={unignoringWord === item.word}
                    onClick={() => unignoreWord(item.word)}
                    aria-label="Remove Keyword"
                    title="Remove Keyword"
                  >
                    {unignoringWord === item.word
                      ? "Removing..."
                      : <><span>{item.word}</span><span className="ignored-keyword-remove" aria-hidden="true">x</span></>}
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn" onClick={save} disabled={saving || !fullName}>
          {saving ? "Saving…" : profile ? "Update profile" : "Create profile"}
        </button>
      </div>
    </div>
  );
}
