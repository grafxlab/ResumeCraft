import { useEffect, useState } from "react";
import { api } from "./api";
import ApplicationsTab from "./components/ApplicationsTab";
import InfoPages, { type InfoPageName } from "./components/InfoPages";
import ProfileTab from "./components/ProfileTab";
import SearchTab from "./components/SearchTab";
import type { Profile } from "./types";

type Tab = "profile" | "search" | "applications";
type Theme = "dark" | "light";

const APP_VERSION = "0.1.0";

export default function App() {
  const [tab, setTab] = useState<Tab>("search");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [focusJobId, setFocusJobId] = useState<number | null>(null);
  const [infoPage, setInfoPage] = useState<InfoPageName | null>(null);
  const [theme, setTheme] = useState<Theme>(() =>
    localStorage.getItem("theme") === "light" ? "light" : "dark",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    api
      .listProfiles()
      .then((list) => {
        if (list.length > 0) setProfile(list[0]);
      })
      .catch(() => {
        /* backend may not be up yet */
      });
  }, []);

  const openApplication = (jobId: number) => {
    setFocusJobId(jobId);
    setInfoPage(null);
    setTab("applications");
  };

  const selectTab = (t: Tab) => {
    setInfoPage(null);
    setTab(t);
  };

  return (
    <div className="app">
      <div className="app-header">
        <div
          className="brand"
          onClick={() => selectTab("search")}
          role="button"
          tabIndex={0}
          title="Go to Search"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") selectTab("search");
          }}
        >
          <img
            src="/ResumeCraftLogo.png"
            alt="ResumeCraft logo"
            className="app-logo"
          />
          <h1><span className="brandTitle1">Resume</span><span className="brandTitle2">Craft</span></h1>
        </div>
        <button
          className="btn secondary theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
      <p className="meta">
        {profile
          ? `Active profile: ${profile.full_name}`
          : "No profile yet — create one in the Profile tab."}
      </p>
      <div className="tabs">
        <button
          className={`tab ${tab === "search" && !infoPage ? "active" : ""}`}
          onClick={() => selectTab("search")}
        >
          Search & Generate
        </button>
        <button
          className={`tab ${tab === "applications" && !infoPage ? "active" : ""}`}
          onClick={() => selectTab("applications")}
        >
          Applications
        </button>
        <button
          className={`tab ${tab === "profile" && !infoPage ? "active" : ""}`}
          onClick={() => selectTab("profile")}
        >
          Profile
        </button>
      </div>

      {infoPage ? (
        <InfoPages page={infoPage} onBack={() => setInfoPage(null)} />
      ) : (
        <>
          {tab === "search" && (
            <SearchTab profile={profile} onOpenApplication={openApplication} />
          )}
          {tab === "applications" && (
            <ApplicationsTab
              focusJobId={focusJobId}
              onFocusHandled={() => setFocusJobId(null)}
            />
          )}
          {tab === "profile" && (
            <ProfileTab profile={profile} onSaved={setProfile} />
          )}
        </>
      )}

      <footer className="app-footer">
        <div className="footer-left">
          <strong><span className="brandTitle1">Resume</span><span className="brandTitle2">Craft</span></strong> <span className="meta">v{APP_VERSION}</span>
          <div className="meta">
            Copyright &copy; {new Date().getFullYear()} GL2, LLC. All rights reserved.
          </div>
        </div>
        <nav className="footer-links">
          <button className="link-btn" onClick={() => setInfoPage("support")}>
            Support
          </button>
          <button className="link-btn" onClick={() => setInfoPage("privacy")}>
            Privacy Policy
          </button>
          <button className="link-btn" onClick={() => setInfoPage("terms")}>
            Terms of Service
          </button>
          <button className="link-btn" onClick={() => setInfoPage("about")}>
            About
          </button>
        </nav>
      </footer>
    </div>
  );
}
