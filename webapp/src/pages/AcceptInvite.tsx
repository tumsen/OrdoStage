import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession, signOut, authClient } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoleBadge } from "@/pages/team/RoleBadge";
import { toast } from "@/components/ui/use-toast";
import { OrdoStageLogo } from "@/components/OrdoStageLogo";

type InvitePreview = {
  organizationName: string;
  email: string;
  role: string;
};

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = searchParams.get("token")?.trim() ?? "";
  const { data: session, isPending: sessionPending } = useSession();
  const [mode, setMode] = useState<"choose" | "signup" | "login">("choose");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

  const { data: preview, isLoading, isError, error } = useQuery({
    queryKey: ["public-invite", token],
    queryFn: () => api.get<InvitePreview>(`/api/public/invite/${token}`),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: () => api.post<{ organizationId: string; orgRole: string }>("/api/team/invitations/accept", { token }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      queryClient.invalidateQueries({ queryKey: ["team"] });
      toast({ title: "You're in", description: "Welcome to the organisation." });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Could not accept", description: err.message, variant: "destructive" });
    },
  });

  const signUpMutation = useMutation({
    mutationFn: async () => {
      const email = preview!.email;
      const res = await authClient.signUp.email({ email, password, name: name.trim() || email.split("@")[0] });
      if (res.error) throw new Error(res.error.message ?? "Sign up failed");
      await api.post("/api/team/invitations/accept", { token });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      toast({ title: "Account created", description: "Welcome to the organisation." });
      navigate("/dashboard");
    },
    onError: (err: Error) => {
      toast({ title: "Could not create account", description: err.message, variant: "destructive" });
    },
  });

  const emailMatch =
    session?.user?.email &&
    preview?.email &&
    session.user.email.toLowerCase() === preview.email.toLowerCase();

  const loginHref = `/login?${new URLSearchParams({
    email: preview?.email ?? "",
    returnTo: `/accept-invite?token=${encodeURIComponent(token)}`,
  }).toString()}`;

  if (!token) {
    return (
      <div className="flex min-h-[min(70vh,520px)] items-center justify-center px-6 py-12">
        <p className="text-white/50 text-sm text-center max-w-md">This invitation link is missing a token.</p>
      </div>
    );
  }

  if (isLoading || sessionPending) {
    return (
      <div className="flex min-h-[min(70vh,520px)] items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-400" />
      </div>
    );
  }

  if (isError || !preview) {
    const msg =
      error instanceof ApiError && error.status === 404
        ? "This invitation is invalid or has expired."
        : "Could not load invitation.";
    return (
      <div className="flex min-h-[min(70vh,520px)] flex-col items-center justify-center gap-4 px-6 py-12">
        <p className="text-white/60 text-sm text-center max-w-md">{msg}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" className="border-white/20 text-white" asChild>
            <Link to="/signup">Sign up</Link>
          </Button>
          <Button variant="outline" className="border-white/20 text-white" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[min(70vh,560px)] items-center justify-center p-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <OrdoStageLogo size={72} />
          </div>
          <h1 className="text-xl font-semibold text-white">Organisation invitation</h1>
          <p className="text-sm text-white/45 mt-2">
            You&apos;ve been invited to join{" "}
            <span className="text-white/80 font-medium">{preview.organizationName}</span>
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-white/40">Email</span>
            <span className="text-white/80 truncate">{preview.email}</span>
          </div>
          <div className="flex justify-between gap-3 items-center">
            <span className="text-white/40">Role</span>
            <RoleBadge role={preview.role} />
          </div>
        </div>

        {!session?.user ? (
          mode === "signup" ? (
            <div className="space-y-3">
              <p className="text-xs text-white/50 text-center">Create your account for <span className="text-white/80">{preview.email}</span></p>
              <Input
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-gray-900 border-white/10 text-white placeholder:text-white/25"
              />
              <Input
                type="password"
                placeholder="Choose a password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && password.length >= 8) signUpMutation.mutate(); }}
                className="bg-gray-900 border-white/10 text-white placeholder:text-white/25"
              />
              <Button
                className="w-full bg-gradient-to-r from-ordo-magenta to-ordo-violet hover:opacity-95 text-white border-0"
                disabled={signUpMutation.isPending || password.length < 8}
                onClick={() => signUpMutation.mutate()}
              >
                {signUpMutation.isPending ? "Creating account…" : "Create account & join"}
              </Button>
              <button className="text-xs text-white/30 hover:text-white/60 w-full text-center" onClick={() => setMode("choose")}>← Back</button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button
                className="w-full bg-gradient-to-r from-ordo-magenta to-ordo-violet hover:opacity-95 text-white border-0"
                onClick={() => setMode("signup")}
              >
                Create account & join
              </Button>
              <Button variant="outline" className="w-full border-white/20 text-white" asChild>
                <Link to={loginHref}>I already have an account — sign in</Link>
              </Button>
            </div>
          )
        ) : emailMatch ? (
          <Button
            className="w-full bg-gradient-to-r from-ordo-magenta to-ordo-violet hover:opacity-95 text-white border-0"
            disabled={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            {acceptMutation.isPending ? "Joining…" : "Accept & join organisation"}
          </Button>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-xs text-amber-200/80">
              You&apos;re signed in as <strong className="text-white">{session.user.email}</strong>. Use the invited
              email ({preview.email}) to accept.
            </p>
            <Button
              variant="outline"
              className="w-full border-white/20 text-white"
              onClick={async () => {
                await signOut();
                navigate(
                  `/login?email=${encodeURIComponent(preview.email)}&returnTo=${encodeURIComponent(`/accept-invite?token=${token}`)}`
                );
              }}
            >
              Sign out and continue as {preview.email}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
