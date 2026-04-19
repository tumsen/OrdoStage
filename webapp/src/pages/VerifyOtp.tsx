import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

export default function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email ?? "";
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? "";
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!email) {
    navigate("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await authClient.signIn.emailOtp({ email, otp });
    setLoading(false);
    if (result.error) {
      setError(result.error.message || "Invalid code");
    } else {
      try {
        const pendingToken = sessionStorage.getItem("pendingInviteToken");
        if (pendingToken) {
          try {
            await api.post("/api/team/invitations/accept", { token: pendingToken });
            sessionStorage.removeItem("pendingInviteToken");
          } catch {
            /* user can open /accept-invite manually */
          }
        }
        if (returnTo) {
          navigate(returnTo);
          return;
        }
        const org = await api.get<unknown>("/api/org");
        if (org) {
          navigate("/dashboard");
        } else {
          navigate("/setup-org");
        }
      } catch {
        if (returnTo) {
          navigate(returnTo);
          return;
        }
        navigate("/setup-org");
      }
    }
  };

  const resend = async () => {
    await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <OrdoStageLogo size={88} />
          </div>
          <h1 className="sr-only">OrdoStage</h1>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-1">Enter your code</h2>
          <p className="text-gray-400 text-sm mb-6">
            We sent a login code to <strong className="text-white">{email}</strong>
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              required
              className="bg-gray-800 border-white/20 text-white text-center text-2xl tracking-widest"
            />
            {error ? <p className="text-red-400 text-sm">{error}</p> : null}
            <Button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
              {loading ? "Verifying..." : "Sign In"}
            </Button>
          </form>
          <button
            onClick={resend}
            className="mt-4 text-sm text-gray-400 hover:text-white w-full text-center"
          >
            Didn't get the code? Resend
          </button>
        </div>
      </div>
    </div>
  );
}
