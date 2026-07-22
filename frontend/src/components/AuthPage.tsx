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
            <span className="google-mark">G</span> Continue with Google
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