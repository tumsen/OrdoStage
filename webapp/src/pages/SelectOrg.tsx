import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import type { OrgMembershipDTO } from "@/lib/postAuthRouting";

export default function SelectOrg() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");

  const { data: rows, isPending } = useQuery({
    queryKey: ["org-memberships"],
    queryFn: () => api.get<OrgMembershipDTO[]>("/api/org/memberships"),
  });

  const switchMutation = useMutation({
    mutationFn: (organizationId: string) => api.post("/api/org/switch", { organizationId }),
    onSuccess: async () => {
      await authClient.getSession();
      queryClient.invalidateQueries({ queryKey: ["org"] });
      queryClient.invalidateQueries({ queryKey: ["org-memberships"] });
      queryClient.invalidateQueries({ queryKey: ["me", "permissions"] });
      navigate("/dashboard", { replace: true });
    },
    onError: () => setError("Could not switch organization. Try again."),
  });

  const didAuto = useRef(false);
  useEffect(() => {
    if (didAuto.current || rows === undefined || isPending) return;
    if (rows.length === 0) {
      navigate("/setup-org", { replace: true });
      return;
    }
    if (rows.length === 1) {
      didAuto.current = true;
      switchMutation.mutate(rows[0].organizationId);
    }
  }, [rows, isPending, navigate, switchMutation]);

  if (isPending || !rows || rows.length === 0 || rows.length === 1) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-violet-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold text-white">Choose organization</h1>
        <p className="text-white/45 text-sm mt-2">
          You belong to more than one organization. Pick which workspace to open.
        </p>
        {error ? <p className="text-red-400 text-sm mt-4">{error}</p> : null}
        <ul className="mt-8 space-y-3">
          {rows.map((r) => (
            <li key={r.organizationId}>
              <Button
                type="button"
                variant="outline"
                disabled={switchMutation.isPending}
                className="w-full justify-between h-auto py-4 px-4 bg-[#111827] border-white/10 text-white hover:bg-white/5"
                onClick={() => switchMutation.mutate(r.organizationId)}
              >
                <span className="font-medium text-left">{r.name}</span>
                <span className="text-xs text-white/40 capitalize">{r.orgRole}</span>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  );
}
