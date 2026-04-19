import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { SidebarContent } from "@/components/Layout";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (emailFromQuery) setEmail(emailFromQuery);
  }, [emailFromQuery]);

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
      navigate(returnTo || "/setup-org");
    } else {
      setLoading(true);
      const result = await authClient.signIn.email({ email: email.trim(), password });
      setLoading(false);
      if (result.error) { setError(result.error.message || "Invalid email or password"); return; }
      if (returnTo) { navigate(returnTo); return; }
      try {
        await api.get<unknown>("/api/org");
        navigate("/dashboard");
      } catch {
        navigate("/setup-org");
      }
    }
  };

  const inputCls =
    "w-full bg-[#1a1f2e] border border-white/10 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder:text-white/25 outline-none focus:border-white/30 transition-colors";

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Sidebar — exact same as the authenticated app */}
      <aside className="w-56 flex-shrink-0 bg-[#0d0d14] border-r border-white/10 flex flex-col">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-7">
            <h1 className="text-xl font-bold tracking-tight">
              {mode === "signin" ? "Sign in" : "Create account"}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              {mode === "signin" ? "Welcome back to Ordo Stage" : "Start managing your productions"}
            </p>
          </div>

          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7 shadow-xl">
            {/* Mode toggle */}
            <div className="flex mb-6 bg-[#1a1f2e] rounded-xl p-1 gap-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setError(""); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                    mode === m ? "bg-[#374151] text-white shadow-sm" : "text-white/45 hover:text-white/80"
                  }`}
                >
                  {m === "signin" ? "Sign In" : "Sign Up"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Your full name" className={inputCls} />
                </div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" className={inputCls} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-white/50 uppercase tracking-wide">Password</label>
                  {mode === "signin" && (
                    <Link to="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className={inputCls} />
              </div>

              {mode === "signup" && (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="••••••••" className={inputCls} />
                </div>
              )}

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors mt-1"
              >
                {loading ? "Please wait…" : mode === "signin" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <div className="flex items-center my-5">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/25 text-xs px-3">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => authClient.signIn.social({ provider: "github", callbackURL: window.location.origin })}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl bg-[#24292e] hover:bg-[#2f363d] border border-white/10 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="white" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.205 11.387.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.216.694.825.576C20.565 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
