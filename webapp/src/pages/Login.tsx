import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { SidebarContent } from "@/components/Layout";
import { completePostAuthenticationNavigation } from "@/lib/postAuthRouting";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo")?.trim() ?? "";
  const emailFromQuery = searchParams.get("email")?.trim() ?? "";

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (emailFromQuery) setEmail(emailFromQuery);
  }, [emailFromQuery]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "signup") {
      if (!name.trim()) {
        setError("Name is required");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }
    setLoading(true);
    const result =
      mode === "signin"
        ? await authClient.signIn.email({ email: email.trim(), password })
        : await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
    setLoading(false);
    if (result.error) {
      setError(result.error.message || (mode === "signin" ? "Invalid email or password" : "Could not create account"));
      return;
    }
    await completePostAuthenticationNavigation(navigate, { returnTo });
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
            <h1 className="text-xl font-bold tracking-tight">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
            <p className="text-white/40 text-sm mt-1">
              {mode === "signin" ? "Welcome back to OrdoStage" : "Start using OrdoStage in minutes"}
            </p>
          </div>

          <div className="bg-[#111827] border border-white/10 rounded-2xl p-7 shadow-xl">
            <div className="mb-4 grid grid-cols-2 rounded-lg bg-[#0f172a] p-1">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMode("signin");
                }}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "signin" ? "bg-violet-600 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setMode("signup");
                }}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "signup" ? "bg-violet-600 text-white" : "text-white/65 hover:text-white"
                }`}
              >
                Sign up
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" ? (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    placeholder="Your full name"
                    className={inputCls}
                  />
                </div>
              ) : null}
              <div>
                <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" className={inputCls} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs text-white/50 uppercase tracking-wide">Password</label>
                  {mode === "signin" ? (
                    <Link to="/forgot-password" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      Forgot password?
                    </Link>
                  ) : null}
                </div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" className={inputCls} />
              </div>
              {mode === "signup" ? (
                <div>
                  <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </div>
              ) : null}

              {error && (
                <p className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-semibold text-sm transition-colors mt-1"
              >
                {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
