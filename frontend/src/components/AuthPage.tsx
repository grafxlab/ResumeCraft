import { useState } from "react";
import { api } from "../api";
import type { AuthSession } from "../types";

interface Props {
  mode: "signup" | "login";
  message?: string | null;
  onModeChange: (mode: "signup" | "login") => void;
  onAuthenticated: (session: AuthSession) => void;
  onBack: () => void;
}

export default function AuthPage({
  mode,
  message,
  onModeChange,
  onAuthenticated,
  onBack,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState(message ?? "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setStatus("");
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const result = await api.signUp(email, password);
        setStatus(result.message);
      } else {
        onAuthenticated(await api.login(email, password));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setError("");
    setStatus("");
    onModeChange(mode === "signup" ? "login" : "signup");
  };

  return (
    <main className="auth-page">
      <button className="text-action auth-back" onClick={onBack}>Back to ResumeCraft</button>
      <section className="auth-layout">
        <div className="auth-intro">
          <img src="/ResumeCraftLogo.png" alt="ResumeCraft logo" className="auth-logo" />
          <p className="eyebrow">YOUR NEXT APPLICATION, WITH INTENT</p>
          <h1>{mode === "signup" ? "Start with a stronger story." : "Welcome back."}</h1>
          <p>Build a profile once, then make every application more specific.</p>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <p className="eyebrow">{mode === "signup" ? "CREATE ACCOUNT" : "SIGN IN"}</p>
          <h2>{mode === "signup" ? "Join ResumeCraft" : "Continue your search"}</h2>
          {status && <p className="auth-message">{status}</p>}
          {error && <p className="error">{error}</p>}
          <label>Email address</label>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          {mode === "signup" && <>
            <label>Confirm password</label>
            <input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
          </>}
          <button className="btn auth-submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "signup" ? "Create account" : "Log in"}
          </button>
          <div className="auth-divider"><span>or</span></div>
          <button type="button" className="google-button" onClick={() => window.location.assign(api.googleLoginUrl())}>
            <svg className="google-mark" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
            </svg>
            Continue with Google
          </button>
          <p className="auth-switch">
            {mode === "signup" ? "Already have an account?" : "New to ResumeCraft?"}{" "}
            <button type="button" className="link-btn" onClick={switchMode}>
              {mode === "signup" ? "Log in" : "Create an account"}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}