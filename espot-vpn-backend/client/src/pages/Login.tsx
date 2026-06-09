import { useState, type FormEvent } from "react";
import { useAuth } from "../lib/auth";
import { Field, ErrorBanner } from "../components/ui";
import { ApiError } from "../lib/api";

export function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">E</div>
          <div>
            <div className="brand-name" style={{ fontSize: 18 }}>
              Espot VPN
            </div>
            <div className="brand-sub">Admin Sign In</div>
          </div>
        </div>
        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          {error && <ErrorBanner message={error} />}
          <Field label="Username">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 6, justifyContent: "center" }}>
            {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
