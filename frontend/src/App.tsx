import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { api } from "./api";
import ApplicationsTab from "./components/ApplicationsTab";
import AuthPage from "./components/AuthPage";
import InfoPages, { type InfoPageName } from "./components/InfoPages";
import LandingPage from "./components/LandingPage";
import ProfileTab from "./components/ProfileTab";
import SearchTab from "./components/SearchTab";
import type { AuthSession, AuthUser, Profile } from "./types";

type Tab = "profile" | "search" | "applications";
type Theme = "dark" | "light";
type View = "landing" | "auth" | "app";

const APP_VERSION = "0.1.0";

export default function App() {
  const [tab, setTab] = useState<Tab>("search");
  const [view, setView] = useState<View>(() =>
    localStorage.getItem("auth.token") ? "app" : "landing",
  );
  const [authMode, setAuthMode] = useState<"signup" | "login">("signup");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
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

  const completeAuthentication = (session: AuthSession) => {
    localStorage.setItem("auth.token", session.token);
    setAuthUser(session.user);
    setAuthMessage(null);
    setView("app");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const confirmationToken = params.get("confirm_token");
    const authToken = params.get("auth_token");
    if (authToken) {
      localStorage.setItem("auth.token", authToken);
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (confirmationToken) {
      window.history.replaceState({}, "", window.location.pathname);
      api
        .confirmEmail(confirmationToken)
        .then(completeAuthentication)
        .catch((error) => {
          setAuthMessage(error instanceof Error ? error.message : String(error));
          setAuthMode("login");
          setView("auth");
        });
      return;
    }
    const token = localStorage.getItem("auth.token");
    if (token) {
      api
        .currentUser()
        .then((user) => {
          setAuthUser(user);
          setView("app");
        })
        .catch(() => {
          localStorage.removeItem("auth.token");
          setView("landing");
        });
    }
  }, []);

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

  const signOut = () => {
    localStorage.removeItem("auth.token");
    setAuthUser(null);
    setProfile(null);
    setProfileMenuOpen(false);
    setView("landing");
  };

  if (view === "landing") {
    return (
      <LandingPage
        onStart={() => {
          setAuthMode("signup");
          setAuthMessage(null);
          setView("auth");
        }}
        onLogin={() => {
          setAuthMode("login");
          setAuthMessage(null);
          setView("auth");
        }}
      />
    );
  }

  if (view === "auth") {
    return (
      <AuthPage
        mode={authMode}
        message={authMessage}
        onModeChange={setAuthMode}
        onAuthenticated={completeAuthentication}
        onBack={() => setView("landing")}
      />
    );
  }

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
          <h1><span className="brandTitle brandTitle1">Resume</span><span className="brandTitle brandTitle2">Craft</span></h1>
        </div>
        <button
          className="btn secondary theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          aria-label="Toggle color theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <button
          className="btn secondary help-button"
          onClick={() => {
            setInfoPage("support");
            setProfileMenuOpen(false);
          }}
          title="Help"
          aria-label="Open Help"
        >
          <CircleHelp size={20} aria-hidden="true" />
        </button>
        <div className="profile-menu">
          <button
            className="profile-trigger"
            aria-expanded={profileMenuOpen}
            aria-label="Open profile menu"
            onClick={() => setProfileMenuOpen((open) => !open)}
          >
            <span className="profile-initial">{authUser?.email.slice(0, 1).toUpperCase() ?? "P"}</span>
          </button>
          {profileMenuOpen && (
            <div className="profile-dropdown">
              <p>{authUser?.email}</p>
              <button onClick={() => { selectTab("profile"); setProfileMenuOpen(false); }}>
                View Profile
              </button>
              <button onClick={signOut}>Sign Out</button>
            </div>
          )}
        </div>
      </div>
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
        <InfoPages
          page={infoPage}
          onBack={() => setInfoPage(null)}
          onNavigate={setInfoPage}
        />
      ) : (
        <>
          {tab === "search" && (
            <SearchTab
              profile={profile}
              onProfileUpdated={setProfile}
              onOpenApplication={openApplication}
            />
          )}
          {tab === "applications" && (
            <ApplicationsTab
              focusJobId={focusJobId}
              profileId={profile?.id}
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
          <button className="link-btn" onClick={() => setInfoPage("templates")}>
            Resume Templates
          </button>
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
