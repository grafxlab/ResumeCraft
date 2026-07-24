export type InfoPageName =
  | "support"
  | "templates"
  | "privacy"
  | "terms"
  | "about";

interface Props {
  page: InfoPageName;
  onBack: () => void;
  onNavigate: (page: InfoPageName) => void;
  showAccountLinks?: boolean;
}

const TITLES: Record<InfoPageName, string> = {
  support: "Support",
  templates: "Resume Templates",
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  about: "About ResumeCraft",
};

export default function InfoPages({
  page,
  onBack,
  onNavigate,
  showAccountLinks = true,
}: Props) {
  return (
    <div className="panel info-page">
      <button className="btn secondary" onClick={onBack}>
        ← Back
      </button>
      <h2>{TITLES[page]}</h2>
      {page === "about" && <About />}
      {page === "support" && (
        <Support onNavigate={onNavigate} showAccountLinks={showAccountLinks} />
      )}
      {page === "templates" && <ResumeTemplates />}
      {page === "privacy" && <Privacy />}
      {page === "terms" && <Terms />}
    </div>
  );
}

function About() {
  return (
    <div className="prose">
      <p>
        <strong>ResumeCraft</strong> helps you find jobs in your field and apply
        faster with tailored application materials.
      </p>
      <h3>What it does</h3>
      <ul>
        <li>
          <strong>Searches job boards</strong> (Adzuna and JSearch) for postings
          matching your role and location.
        </li>
        <li>
          <strong>Scores each posting</strong> against your master profile so you
          can focus on the best-fit roles.
        </li>
        <li>
          <strong>Generates tailored resumes and cover letters</strong> with AI,
          using only the facts from your profile — no fabricated experience.
        </li>
        <li>
          <strong>Lets you review, edit, approve, and regenerate</strong> each
          document, then download it as a styled PDF.
        </li>
        <li>
          <strong>Tracks your applications</strong> — status, dates, notes,
          linked documents, archiving, and the original posting link.
        </li>
        <li>
          <strong>Imports an existing resume</strong> (PDF, DOCX, or TXT) and
          extracts your details into a structured profile automatically.
        </li>
      </ul>
      <p className="meta">
        Your profile is the single source of truth for every generated document.
      </p>
    </div>
  );
}

function Support({
  onNavigate,
  showAccountLinks,
}: Pick<Props, "onNavigate" | "showAccountLinks">) {
  return (
    <div className="prose">
      <p>Need help using ResumeCraft?</p>
      <ul>
        {showAccountLinks && (
          <li>
            <button className="link-btn info-link" onClick={() => onNavigate("templates")}>
              Create and use resume templates
            </button>
            .
          </li>
        )}
        <li>
          Email us at <a href="mailto:support@gl2.example">support@gl2.example</a>
          .
        </li>
        <li>Check the README in the project repository for setup and usage.</li>
        <li>
          Report bugs or request features through your team's issue tracker.
        </li>
      </ul>
      <p className="meta">
        When reporting an issue, include what you were doing and any error
        message shown on screen.
      </p>
    </div>
  );
}

function ResumeTemplates() {
  return (
    <div className="prose">
      <p>
        A resume template is a standalone HTML, Markdown, or text document that
        guides the section order and presentation of a tailored resume. Upload it
        from Search Job Boards, select it from the Resume template control, then
        generate a resume. Your saved templates stay private to your account.
      </p>

      <h3>Start with the example</h3>
      <p>
        Use <a href="/templates/resume-template-1.html" target="_blank" rel="noreferrer">resume-template-1.html</a>{" "}
        as the starting point. It includes print-ready CSS, semantic sections,
        and examples of repeating skills, employment, and education content.
      </p>

      <h3>Use clear section labels</h3>
      <p>
        Use descriptive headings for the content you want in the generated
        resume, such as Summary, Skills, Experience, Education, and
        Certifications. The generator uses your profile as the source of truth
        and keeps the result editable in the document editor.
      </p>

      <h3>Repeat data-driven blocks</h3>
      <p>
        Keep skills, roles, achievements, and credentials in clearly separated
        blocks. The generator can then preserve the intended grouping while
        tailoring the content for each position.
      </p>

      <h3>Keep the required sections</h3>
      <ul>
        <li><strong>Overview:</strong> a short professional summary.</li>
        <li><strong>Skills:</strong> relevant skills for the target position.</li>
        <li><strong>Employment:</strong> role, employer, dates, and achievement bullets.</li>
        <li><strong>Education:</strong> degree, institution, dates, and details.</li>
        <li><strong>Additional information:</strong> certifications, languages, awards, or volunteer work.</li>
      </ul>

      <h3>Design for print</h3>
      <p>
        Include all CSS inside the HTML file, use <code>@page</code> for print
        margins, and avoid scripts or remote assets. Prefer clean type, clear
        section headings, and simple layouts that remain readable when saved as
        a PDF.
      </p>
    </div>
  );
}

function Privacy() {
  return (
    <div className="prose">
      <p>
        This is a summary of how ResumeCraft handles your data. Replace with your
        organization's formal policy before public release.
      </p>
      <ul>
        <li>
          <strong>What we store:</strong> your profile, job postings you search,
          generated documents, and application tracking data — kept in your own
          PostgreSQL database.
        </li>
        <li>
          <strong>Third-party services:</strong> job searches call Adzuna and
          JSearch; document generation and resume parsing call your configured AI
          provider (OpenAI or Anthropic). Relevant text is sent to those services
          to fulfill your request.
        </li>
        <li>
          <strong>Credentials:</strong> API keys are stored in your local backend
          environment and are never exposed to the browser.
        </li>
        <li>
          <strong>Your control:</strong> you can edit your profile and delete
          tracked applications at any time.
        </li>
      </ul>
    </div>
  );
}

function Terms() {
  return (
    <div className="prose">
      <p>
        This is a summary of the terms for using ResumeCraft. Replace with your
        organization's formal terms before public release.
      </p>
      <ul>
        <li>
          ResumeCraft is provided “as is,” without warranty of any kind.
        </li>
        <li>
          You are responsible for reviewing every generated resume and cover
          letter for accuracy before submitting it to an employer.
        </li>
        <li>
          You agree to use third-party job boards and AI providers in accordance
          with their respective terms of service.
        </li>
        <li>
          Do not use ResumeCraft to misrepresent your qualifications or to submit
          fraudulent applications.
        </li>
      </ul>
    </div>
  );
}
