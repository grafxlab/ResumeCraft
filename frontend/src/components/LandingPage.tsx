import { Check } from "lucide-react";

interface Props {
  onStart: () => void;
  onLogin: () => void;
}

const features = [
  ["Targeted search", "Search across job boards from one deliberate workspace."],
  ["Clear fit signals", "See the skills that match, the gaps to address, and why."],
  ["Tailored documents", "Create focused resumes and cover letters from your profile."],
  ["Application clarity", "Keep each opportunity, document, and next step in view."],
];

const plans = [
  {
    name: "Free trial",
    price: "$0",
    cadence: "one time",
    description: "Explore the complete workflow before choosing a plan.",
    features: ["3 AI-generated documents", "Job search and match scoring", "Resume and cover letter templates"],
    action: "Start free",
  },
  {
    name: "Essential",
    price: "$19",
    cadence: "per month",
    description: "For a focused search with a steady application pace.",
    features: ["30 AI-generated documents monthly", "Resume and job URL imports", "Application tracking"],
    action: "Choose Essential",
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per month",
    description: "For active job seekers tailoring every application.",
    features: ["100 AI-generated documents monthly", "Advanced custom templates", "Priority document generation"],
    action: "Choose Pro",
    featured: true,
  },
  {
    name: "Power",
    price: "$49",
    cadence: "per month",
    description: "For high-volume searches and multiple career profiles.",
    features: ["250 AI-generated documents monthly", "Multiple candidate profiles", "Highest usage limits"],
    action: "Choose Power",
  },
];

export default function LandingPage({ onStart, onLogin }: Props) {
  return (
    <main className="landing">
      <header className="landing-nav">
        <div className="brand landing-brand">
          <img src="/ResumeCraftLogo.png" alt="ResumeCraft logo" className="app-logo" />
          <div className="brand-copy">
            <strong><span className="brandTitle brandTitle1">Resume</span><span className="brandTitle brandTitle2">Craft</span></strong>
            <p>Find the Job. Craft Your Story.</p>
          </div>
        </div>
        <div className="landing-nav-actions">
          <button className="text-action" onClick={onLogin}>Log in</button>
          <button className="btn" onClick={onStart}>Get started</button>
        </div>
      </header>

      <section className="landing-hero">
        <p className="eyebrow">A calmer way to job search</p>
        <h1>ResumeCraft</h1>
        <p className="landing-lede">
          A modern workspace for turning your experience into thoughtful,
          job-specific applications. ResumeCraft gets smarter as you use it.
          Refine keywords, remove what doesn't matter, and craft your perfect
          resume for each job you apply for.
        </p>
        <div className="landing-actions">
          <button className="btn landing-primary" onClick={onStart}>Create your account</button>
          <button className="text-action" onClick={onLogin}>I already have an account</button>
        </div>
        <div className="hero-preview" aria-label="ResumeCraft workspace preview">
          <div className="preview-sidebar">
            <span className="preview-logo">RC</span>
            <span className="preview-nav active">Search</span>
            <span className="preview-nav">Applications</span>
            <span className="preview-nav">Profile</span>
          </div>
          <div className="preview-content">
            <div className="preview-kicker">OPPORTUNITY REVIEW</div>
            <div className="preview-title-row"><span>Senior Product Designer</span><b>84% match</b></div>
            <div className="preview-company">Northstar Labs · Remote</div>
            <div className="preview-divider" />
            <div className="preview-label">MATCHED SKILLS</div>
            <div className="preview-chips"><i>Research</i><i>Figma</i><i>Design systems</i></div>
            <div className="preview-label muted-label">TO EXPLORE</div>
            <div className="preview-chips"><i className="missing">Data visualization</i><i className="missing">B2B SaaS</i></div>
          </div>
        </div>
      </section>

      <section className="feature-band">
        {features.map(([title, description], index) => (
          <article key={title} className="feature-item">
            <span className="feature-index">0{index + 1}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <section className="pricing-band" aria-labelledby="pricing-heading">
        <div className="pricing-heading">
          <p className="eyebrow">Simple, predictable pricing</p>
          <h2 id="pricing-heading">Choose the pace of your search</h2>
          <p>Every plan includes job discovery, fit analysis, document editing, PDF exports, and application tracking.</p>
        </div>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article key={plan.name} className={`pricing-card ${plan.featured ? "featured" : ""}`}>
              {plan.featured && <span className="pricing-badge">Most popular</span>}
              <h3>{plan.name}</h3>
              <div className="pricing-price"><strong>{plan.price}</strong><span>{plan.cadence}</span></div>
              <p className="pricing-description">{plan.description}</p>
              <ul>{plan.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}</ul>
              <button className={`btn pricing-action ${plan.featured ? "pricing-primary" : ""}`} onClick={onStart}>{plan.action}</button>
            </article>
          ))}
        </div>
        <p className="pricing-footnote">One resume or cover letter counts as one generated document. Cancel or change plans at any time.</p>
      </section>
    </main>
  );
}