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
          <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "white", margin: 0 }}>Theater Planner</h1>
          <p style={{ color: "#9ca3af", marginTop: "8px" }}>Manage your productions</p>
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
        </div>
      </div>
    </div>
  );
}
