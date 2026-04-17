import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "signup") {
      if (password !== confirm) { setError("Passwords do not match"); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
      setLoading(true);
      const result = await authClient.signUp.email({ email: email.trim(), password, name: name.trim() });
      setLoading(false);
      if (result.error) { setError(result.error.message || "Sign up failed"); return; }
      navigate("/setup-org");
    } else {
      setLoading(true);
      const result = await authClient.signIn.email({ email: email.trim(), password });
      setLoading(false);
      if (result.error) { setError(result.error.message || "Invalid email or password"); return; }
      try {
        await api.get<unknown>("/api/org");
        navigate("/");
      } catch {
        navigate("/setup-org");
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: "420px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>🎭</div>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "white", margin: 0 }}>OrdoStage</h1>
          <p style={{ color: "#9ca3af", marginTop: "8px" }}>Run your productions with confidence</p>
        </div>

        <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "24px" }}>
          {/* Mode toggle */}
          <div style={{ display: "flex", marginBottom: "24px", background: "#1f2937", borderRadius: "8px", padding: "4px" }}>
            <button
              type="button"
              onClick={() => { setMode("signin"); setError(""); }}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: mode === "signin" ? "#374151" : "transparent",
                color: mode === "signin" ? "white" : "#9ca3af",
                fontWeight: mode === "signin" ? "600" : "400",
                fontSize: "14px"
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(""); }}
              style={{
                flex: 1, padding: "8px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: mode === "signup" ? "#374151" : "transparent",
                color: mode === "signup" ? "white" : "#9ca3af",
                fontWeight: mode === "signup" ? "600" : "400",
                fontSize: "14px"
              }}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d1d5db", fontSize: "14px", marginBottom: "6px" }}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "10px 12px", color: "white", fontSize: "15px", boxSizing: "border-box" }}
                />
              </div>
            )}

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", color: "#d1d5db", fontSize: "14px", marginBottom: "6px" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "10px 12px", color: "white", fontSize: "15px", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: mode === "signin" ? "8px" : "16px" }}>
              <label style={{ display: "block", color: "#d1d5db", fontSize: "14px", marginBottom: "6px" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "10px 12px", color: "white", fontSize: "15px", boxSizing: "border-box" }}
              />
            </div>

            {mode === "signup" && (
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", color: "#d1d5db", fontSize: "14px", marginBottom: "6px" }}>Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{ width: "100%", background: "#1f2937", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "6px", padding: "10px 12px", color: "white", fontSize: "15px", boxSizing: "border-box" }}
                />
              </div>
            )}

            {mode === "signin" && (
              <div style={{ textAlign: "right", marginBottom: "16px" }}>
                <Link to="/forgot-password" style={{ color: "#a78bfa", fontSize: "14px", textDecoration: "none" }}>
                  Forgot password?
                </Link>
              </div>
            )}

            {error ? <p style={{ color: "#f87171", fontSize: "14px", marginBottom: "12px" }}>{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%", padding: "11px", background: loading ? "#7c3aed" : "#7c3aed",
                border: "none", borderRadius: "6px", color: "white", fontSize: "15px",
                fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
            <span style={{ color: "#6b7280", fontSize: "13px", padding: "0 12px" }}>or</span>
            <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
          </div>

          {/* GitHub OAuth button */}
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              await authClient.signIn.social({
                provider: "github",
                callbackURL: window.location.origin,
              });
            }}
            style={{
              width: "100%", padding: "11px 16px",
              background: "#24292e",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px", color: "white", fontSize: "15px",
              fontWeight: "600", cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#2f363d"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#24292e"; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.216.694.825.576C20.565 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
            </svg>
            Continue with GitHub
          </button>
        </div>
      </div>
    </div>
  );
}
