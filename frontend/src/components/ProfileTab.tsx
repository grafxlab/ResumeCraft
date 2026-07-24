import { useEffect, useRef, useState } from "react";
import { Eye, Trash2, Upload, X } from "lucide-react";
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

const masterResumeDraftKey = (profileId: number) =>
  `profile.masterResumeTextDraft.${profileId}`;

export default function ProfileTab({ profile, onSaved }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [summary, setSummary] = useState("");
  const [masterResumeText, setMasterResumeText] = useState("");
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
  const [masterResumeExpanded, setMasterResumeExpanded] = useState(
    () => localStorage.getItem("profile.masterResumeExpanded") === "true",
  );
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState<{
    documentType: "resume" | "cover_letter";
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<number | null>(null);
  const [templateEditor, setTemplateEditor] = useState<{
    id: number | null;
    name: string;
    documentType: "resume" | "cover_letter";
    content: string;
  } | null>(null);
  const [loadingTemplateEditor, setLoadingTemplateEditor] = useState(false);
  const [savingTemplateEditor, setSavingTemplateEditor] = useState(false);
  const [pendingTemplateUpload, setPendingTemplateUpload] = useState<{
    content: string;
    documentType: "resume" | "cover_letter";
    originalName: string;
    name: string;
    duplicateId: number;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const templateFileRef = useRef<HTMLInputElement>(null);
  const coverLetterTemplateFileRef = useRef<HTMLInputElement>(null);
  const hydratedProfileId = useRef<number | null>(null);

  const applyData = (data: Partial<Profile>) => {
    if (data.full_name != null) setFullName(data.full_name);
    if (data.email != null) setEmail(data.email);
    if (data.phone != null) setPhone(data.phone);
    if (data.location != null) setLocation(data.location);
    if (data.summary != null) setSummary(data.summary);
    if (data.master_resume_text !== undefined) {
      setMasterResumeText(data.master_resume_text ?? "");
    }
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

  const applyImportedResumeData = (data: Partial<Profile>) => {
    const {
      additional_information: _additionalInformation,
      additional_information_items: _additionalInformationItems,
      links: _links,
      profile_link_items: _profileLinkItems,
      ...resumeData
    } = data;
    applyData(resumeData);
  };

  useEffect(() => {
    if (!profile) {
      hydratedProfileId.current = null;
      return;
    }
    if (profile.id !== hydratedProfileId.current) {
      hydratedProfileId.current = profile.id;
      applyData(profile);
      const masterResumeDraft = localStorage.getItem(masterResumeDraftKey(profile.id));
      if (masterResumeDraft != null) setMasterResumeText(masterResumeDraft);
      return;
    }
    setResumeTemplateId(profile.resume_template_id);
    setCoverLetterTemplateId(profile.cover_letter_template_id);
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

  useEffect(() => {
    if (!templateNotice) return;
    const timeout = window.setTimeout(() => setTemplateNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [templateNotice]);

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
      applyImportedResumeData(parsed);
      if (profile && parsed.master_resume_text !== undefined) {
        localStorage.setItem(
          masterResumeDraftKey(profile.id),
          parsed.master_resume_text ?? "",
        );
      }
      setNotice(
        "Resume imported. Your links and Additional Information were preserved. Review the fields below, then Save to store it.",
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
    if (!/\.html?$/i.test(file.name)) {
      setTemplateNotice({
        documentType,
        message: "Upload an HTML template.",
        tone: "error",
      });
      return;
    }
    if (file.size > 250_000) {
      setTemplateNotice({
        documentType,
        message: "Template files must be 250 KB or smaller.",
        tone: "error",
      });
      return;
    }
    setUploadingTemplate(true);
    setError(null);
    setTemplateNotice(null);
    try {
      const content = await file.text();
      const placeholders = new Set(
        [...content.matchAll(/{{\s*([A-Z][A-Z0-9_]*)\s*}}/g)].map(
          (match) => match[1],
        ),
      );
      const supported = (documentType === "resume"
        ? ["FULL_NAME", "PROFESSIONAL_HEADLINE", "EMAIL", "PHONE", "LOCATION", "OVERVIEW", "SKILL", "JOB_TITLE", "COMPANY", "EMPLOYMENT_DATES", "EMPLOYMENT_ACHIEVEMENT", "DEGREE_OR_CREDENTIAL", "INSTITUTION", "ADDITIONAL_INFORMATION", "ADDITIONAL_LABEL", "ADDITIONAL_URL", "ADDITIONAL_URL_LABEL"]
        : ["FULL_NAME", "EMAIL", "PHONE", "LOCATION", "DATE", "RECIPIENT_NAME", "COMPANY", "SALUTATION", "CLOSING", "LETTER_BODY", "DOCUMENT_CONTENT"]
      ).filter((placeholder) => placeholders.has(placeholder));
      if (supported.length < 3) {
        throw new Error(
          "Templates need at least three supported placeholders for the selected document type.",
        );
      }
      const name = file.name.replace(/\.html?$/i, "") || "Document template";
      const templates = documentType === "resume" ? resumeTemplates : coverLetterTemplates;
      const duplicate = templates.find(
        (template) => template.name.trim().toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        setPendingTemplateUpload({
          content,
          documentType,
          originalName: duplicate.name,
          name: duplicate.name,
          duplicateId: duplicate.id,
        });
      } else {
        await saveTemplateUpload(name, content, documentType);
      }
    } catch (e) {
      setTemplateNotice({
        documentType,
        message: e instanceof Error ? e.message : String(e),
        tone: "error",
      });
    } finally {
      setUploadingTemplate(false);
      const fileInput = documentType === "resume" ? templateFileRef : coverLetterTemplateFileRef;
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const saveTemplateUpload = async (
    name: string,
    content: string,
    documentType: "resume" | "cover_letter",
    replaceId?: number,
  ) => {
    const template = replaceId == null
      ? await api.createResumeTemplate(name, content, documentType)
      : await api.replaceResumeTemplate(replaceId, name, content, documentType);
    if (documentType === "resume") {
      setResumeTemplates((current) => [
        template,
        ...current.filter((item) => item.id !== template.id),
      ]);
      setResumeTemplateId(template.id);
    } else {
      setCoverLetterTemplates((current) => [
        template,
        ...current.filter((item) => item.id !== template.id),
      ]);
      setCoverLetterTemplateId(template.id);
    }
    if (profile) {
      const updated = await api.updateProfileTemplate(profile.id, template.id, documentType);
      onSaved(updated);
      setTemplateNotice({
        documentType,
        message: `${template.name} is now your default ${documentType === "resume" ? "resume" : "cover letter"} template.`,
        tone: "success",
      });
    } else {
      setTemplateNotice({
        documentType,
        message: `Template uploaded. Create your profile to use ${template.name} by default.`,
        tone: "success",
      });
    }
  };

  const confirmTemplateUpload = async () => {
    if (!pendingTemplateUpload) return;
    const name = pendingTemplateUpload.name.trim();
    if (!name) {
      setTemplateNotice({
        documentType: pendingTemplateUpload.documentType,
        message: "Template name is required.",
        tone: "error",
      });
      return;
    }
    const replacingOriginal =
      name.toLowerCase() === pendingTemplateUpload.originalName.trim().toLowerCase();
    setUploadingTemplate(true);
    setError(null);
    try {
      await saveTemplateUpload(
        name,
        pendingTemplateUpload.content,
        pendingTemplateUpload.documentType,
        replacingOriginal ? pendingTemplateUpload.duplicateId : undefined,
      );
      setPendingTemplateUpload(null);
    } catch (e) {
      setTemplateNotice({
        documentType: pendingTemplateUpload.documentType,
        message: e instanceof Error ? e.message : String(e),
        tone: "error",
      });
    } finally {
      setUploadingTemplate(false);
    }
  };

  const deleteTemplate = async (
    templateId: number,
    documentType: "resume" | "cover_letter",
  ) => {
    const list = documentType === "resume" ? resumeTemplates : coverLetterTemplates;
    const target = list.find((template) => template.id === templateId);
    if (!target) return;
    if (!window.confirm(`Delete template "${target.name}"? This cannot be undone.`)) return;
    const wasSelected =
      (documentType === "resume" ? resumeTemplateId : coverLetterTemplateId) === templateId;
    const previousTemplateId = documentType === "resume" ? resumeTemplateId : coverLetterTemplateId;
    let deleted = false;
    setDeletingTemplate(templateId);
    setError(null);
    if (documentType === "resume") {
      setResumeTemplates((current) => current.filter((template) => template.id !== templateId));
      if (wasSelected) setResumeTemplateId(null);
    } else {
      setCoverLetterTemplates((current) => current.filter((template) => template.id !== templateId));
      if (wasSelected) setCoverLetterTemplateId(null);
    }
    try {
      await api.deleteResumeTemplate(templateId);
      deleted = true;
      if (wasSelected) {
        if (profile) {
          const updated = await api.updateProfileTemplate(profile.id, null, documentType);
          onSaved(updated);
        }
      }
      const currentTemplates = await api.listResumeTemplates(documentType);
      if (documentType === "resume") setResumeTemplates(currentTemplates);
      else setCoverLetterTemplates(currentTemplates);
      setNotice(`${target.name} was deleted.`);
    } catch (e) {
      const currentTemplates = await api.listResumeTemplates(documentType).catch(() => null);
      const fallbackTemplates = deleted
        ? list.filter((template) => template.id !== templateId)
        : list;
      if (documentType === "resume") {
        setResumeTemplates(currentTemplates ?? fallbackTemplates);
        if (!deleted && (currentTemplates == null || currentTemplates.some((template) => template.id === templateId))) {
          setResumeTemplateId(previousTemplateId);
        }
      } else {
        setCoverLetterTemplates(currentTemplates ?? fallbackTemplates);
        if (!deleted && (currentTemplates == null || currentTemplates.some((template) => template.id === templateId))) {
          setCoverLetterTemplateId(previousTemplateId);
        }
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingTemplate(null);
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

  const openTemplateEditor = async (documentType: "resume" | "cover_letter") => {
    const templateId = documentType === "resume" ? resumeTemplateId : coverLetterTemplateId;
    const templates = documentType === "resume" ? resumeTemplates : coverLetterTemplates;
    const selected = templates.find((template) => template.id === templateId);
    setError(null);
    if (selected) {
      setTemplateEditor({
        id: selected.id,
        name: selected.name,
        documentType,
        content: selected.content,
      });
      return;
    }

    setLoadingTemplateEditor(true);
    try {
      const fileName = documentType === "resume"
        ? "default-resume-template.html"
        : "default-letter-template.html";
      const response = await fetch(`/templates/${fileName}`);
      if (!response.ok) throw new Error(`Unable to load default template (${response.status})`);
      setTemplateEditor({
        id: null,
        name: documentType === "resume" ? "Default resume template" : "Default cover letter template",
        documentType,
        content: await response.text(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingTemplateEditor(false);
    }
  };

  const saveTemplateEditor = async () => {
    if (!templateEditor || templateEditor.id == null) return;
    setSavingTemplateEditor(true);
    setError(null);
    try {
      const updated = await api.replaceResumeTemplate(
        templateEditor.id,
        templateEditor.name,
        templateEditor.content,
        templateEditor.documentType,
      );
      const updateTemplates = (templates: ResumeTemplate[]) =>
        templates.map((template) => template.id === updated.id ? updated : template);
      if (updated.document_type === "resume") setResumeTemplates(updateTemplates);
      else setCoverLetterTemplates(updateTemplates);
      setTemplateEditor((current) => current ? { ...current, content: updated.content } : null);
      setNotice(`${updated.name} was updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTemplateEditor(false);
    }
  };

  const templatePreviewHtml = templateEditor?.content.replace(
    /{{\s*[A-Z][A-Z0-9_]*\s*}}/g,
    "",
  ) ?? "";

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
        master_resume_text: masterResumeText || null,
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
      localStorage.removeItem(masterResumeDraftKey(saved.id));
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
      {templateEditor && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !savingTemplateEditor && setTemplateEditor(null)}
        >
          <div
            className="modal template-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <strong id="template-editor-title">{templateEditor.name}</strong>
                <p className="meta">
                  {templateEditor.id == null
                    ? "Built-in template. Edits are preview-only."
                    : "Edit the HTML and review the data-free preview."}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                aria-label="Close template editor"
                title="Close"
                disabled={savingTemplateEditor}
                onClick={() => setTemplateEditor(null)}
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="template-editor-layout">
              <div className="template-editor-pane">
                <label htmlFor="template-html-editor">HTML code</label>
                <textarea
                  id="template-html-editor"
                  value={templateEditor.content}
                  onChange={(event) => setTemplateEditor((current) =>
                    current ? { ...current, content: event.target.value } : null
                  )}
                  spellCheck={false}
                />
              </div>
              <div className="template-editor-pane">
                <label>Preview without data</label>
                <iframe
                  className="template-code-preview"
                  sandbox=""
                  srcDoc={templatePreviewHtml}
                  title={`${templateEditor.name} preview without data`}
                />
              </div>
            </div>
            <div className="actions">
              {templateEditor.id != null && (
                <button
                  type="button"
                  className="btn"
                  disabled={savingTemplateEditor}
                  onClick={() => void saveTemplateEditor()}
                >
                  {savingTemplateEditor ? "Saving..." : "Save template"}
                </button>
              )}
              <button
                type="button"
                className="btn secondary"
                disabled={savingTemplateEditor}
                onClick={() => setTemplateEditor(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingTemplateUpload && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !uploadingTemplate && setPendingTemplateUpload(null)}
        >
          <div
            className="modal template-name-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="template-name-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong id="template-name-title">Template name already exists</strong>
            </div>
            <p className="meta">
              Change the name to save a new template, or keep it unchanged to replace the existing template.
            </p>
            <label htmlFor="template-upload-name">Template name</label>
            <input
              id="template-upload-name"
              autoFocus
              maxLength={120}
              value={pendingTemplateUpload.name}
              onChange={(event) => setPendingTemplateUpload((current) =>
                current ? { ...current, name: event.target.value } : current
              )}
              onKeyDown={(event) => {
                if (event.key === "Enter") void confirmTemplateUpload();
              }}
            />
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button className="btn" disabled={uploadingTemplate} onClick={() => void confirmTemplateUpload()}>
                {uploadingTemplate ? "Saving..." : "Save"}
              </button>
              <button className="btn secondary" disabled={uploadingTemplate} onClick={() => setPendingTemplateUpload(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
      <h2>Master Profile</h2>
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
        <div className="row" style={{ alignItems: "center", marginTop: 10 }}>
          <label className="btn secondary template-upload">
            {importing ? "Importing..." : "Import resume file"}
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
          </label>
        </div>
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
            placeholders={["WEBSITE_LABEL", "WEBSITE_URL"]}
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
        onChange={async (items) => {
          if (!profile) {
            setAdditionalInformationItems(items);
            return;
          }
          const updated = await api.updateAdditionalInformation(profile.id, items);
          setAdditionalInformationItems(updated.additional_information_items);
          onSaved(updated);
          setNotice("Additional information saved.");
        }}
        placeholders={["ADDITIONAL_INFORMATION"]}
      />
      <div
        className="panel"
        style={{ background: "var(--bg)", marginTop: 16, marginBottom: 0 }}
      >
        <button
          className="section-toggle"
          aria-expanded={masterResumeExpanded}
          onClick={() => setMasterResumeExpanded((expanded) => {
            const next = !expanded;
            localStorage.setItem("profile.masterResumeExpanded", String(next));
            return next;
          })}
        >
          <strong>Complete Resume Text</strong>
          <span aria-hidden="true">{masterResumeExpanded ? "Hide" : "Show"}</span>
        </button>
        {masterResumeExpanded && (
          <>
            <label>Imported source text used by AI</label>
            <textarea
              value={masterResumeText}
              onChange={(event) => {
                const value = event.target.value;
                setMasterResumeText(value);
                if (profile) {
                  localStorage.setItem(masterResumeDraftKey(profile.id), value);
                }
              }}
              style={{ minHeight: 260 }}
            />
          </>
        )}
      </div>
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
              <button
                type="button"
                className="icon-btn template-preview-btn"
                aria-label="Edit and preview resume template"
                title="Preview"
                disabled={loadingTemplateEditor}
                onClick={() => void openTemplateEditor("resume")}
              >
                <Eye size={17} aria-hidden="true" />
              </button>
              <label
                className="icon-btn template-preview-btn template-upload"
                aria-label="Upload resume template"
                aria-disabled={uploadingTemplate}
                title="Upload"
              >
                <Upload size={17} aria-hidden="true" />
                <input
                  ref={templateFileRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  disabled={uploadingTemplate}
                  onChange={(event) => void uploadTemplate(event.target.files?.[0], "resume")}
                />
              </label>
              {resumeTemplateId != null && (
                <button
                  type="button"
                  className="icon-btn danger template-preview-btn"
                  aria-label="Delete resume template"
                  title="Delete"
                  disabled={deletingTemplate != null}
                  onClick={() => void deleteTemplate(resumeTemplateId, "resume")}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            {templateNotice?.documentType === "resume" && (
              <p className={`meta template-notice ${templateNotice.tone}`}>{templateNotice.message}</p>
            )}
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
              <button
                type="button"
                className="icon-btn template-preview-btn"
                aria-label="Edit and preview cover letter template"
                title="Preview"
                disabled={loadingTemplateEditor}
                onClick={() => void openTemplateEditor("cover_letter")}
              >
                <Eye size={17} aria-hidden="true" />
              </button>
              <label
                className="icon-btn template-preview-btn template-upload"
                aria-label="Upload cover letter template"
                aria-disabled={uploadingTemplate}
                title="Upload"
              >
                <Upload size={17} aria-hidden="true" />
                <input
                  ref={coverLetterTemplateFileRef}
                  type="file"
                  accept=".html,.htm,text/html"
                  disabled={uploadingTemplate}
                  onChange={(event) => void uploadTemplate(event.target.files?.[0], "cover_letter")}
                />
              </label>
              {coverLetterTemplateId != null && (
                <button
                  type="button"
                  className="icon-btn danger template-preview-btn"
                  aria-label="Delete cover letter template"
                  title="Delete"
                  disabled={deletingTemplate != null}
                  onClick={() => void deleteTemplate(coverLetterTemplateId, "cover_letter")}
                >
                  <Trash2 size={17} aria-hidden="true" />
                </button>
              )}
            </div>
            {templateNotice?.documentType === "cover_letter" && (
              <p className={`meta template-notice ${templateNotice.tone}`}>{templateNotice.message}</p>
            )}
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
