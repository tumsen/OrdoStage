import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useSession, signOut } from "@/lib/auth-client";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
      toast({
        title: "Could not accept",
        description: err.message,
        variant: "destructive",
      });
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
        <Button variant="outline" className="border-white/20 text-white" asChild>
          <Link to="/login">Sign in</Link>
        </Button>
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
          <div className="space-y-3">
            <p className="text-xs text-white/40 text-center">
              Sign in with this email address to accept.
            </p>
            <Button
              className="w-full bg-gradient-to-r from-ordo-magenta to-ordo-violet hover:opacity-95 text-white border-0"
              asChild
            >
              <Link to={loginHref}>Continue to sign in</Link>
            </Button>
          </div>
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
