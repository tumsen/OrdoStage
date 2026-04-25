import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, isApiError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Pricing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    defaultUserDailyRateCents: "1500",
    defaultDiscountPercent: "0",
    defaultFlatRateCents: "",
    defaultFlatRateMaxUsers: "",
    paymentDueDays: "7",
  });

  const { data, isPending } = useQuery<{
    defaultUserDailyRateCents: number;
    defaultDiscountPercent: number;
    defaultFlatRateCents: number | null;
    defaultFlatRateMaxUsers: number | null;
    paymentDueDays: number;
  }>({
    queryKey: ["admin", "billing-settings"],
    queryFn: () => api.get("/api/admin/billing/settings"),
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      defaultUserDailyRateCents: String(data.defaultUserDailyRateCents),
      defaultDiscountPercent: String(data.defaultDiscountPercent),
      defaultFlatRateCents: data.defaultFlatRateCents == null ? "" : String(data.defaultFlatRateCents),
      defaultFlatRateMaxUsers: data.defaultFlatRateMaxUsers == null ? "" : String(data.defaultFlatRateMaxUsers),
      paymentDueDays: String(data.paymentDueDays),
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch("/api/admin/billing/settings", {
        defaultUserDailyRateCents: Number(form.defaultUserDailyRateCents),
        defaultDiscountPercent: Number(form.defaultDiscountPercent),
        defaultFlatRateCents: form.defaultFlatRateCents.trim() ? Number(form.defaultFlatRateCents) : null,
        defaultFlatRateMaxUsers: form.defaultFlatRateMaxUsers.trim() ? Number(form.defaultFlatRateMaxUsers) : null,
        paymentDueDays: Number(form.paymentDueDays),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "billing-settings"] });
      toast({ title: "Saved", description: "Default billing settings updated." });
    },
    onError: (err) => {
      const msg = isApiError(err) ? err.message : "Failed to save settings.";
      toast({ title: "Error", description: msg, variant: "destructive" });
    },
  });

  const snapshotMutation = useMutation({
    mutationFn: () => api.post("/api/admin/billing/snapshot"),
    onSuccess: () => {
      toast({ title: "Snapshot completed", description: "Daily usage snapshots updated." });
    },
  });

  const invoiceMutation = useMutation({
    mutationFn: () => api.post("/api/admin/billing/generate-invoices"),
    onSuccess: () => {
      toast({ title: "Invoices generated", description: "Monthly invoice generation finished." });
    },
  });

  return (
    <div className="p-6 space-y-4">
      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Postpaid billing defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-white/50">Daily user rate (cents)</p>
            <Input value={form.defaultUserDailyRateCents} onChange={(e) => setForm((p) => ({ ...p, defaultUserDailyRateCents: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-white/50">Default discount (%)</p>
            <Input value={form.defaultDiscountPercent} onChange={(e) => setForm((p) => ({ ...p, defaultDiscountPercent: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-white/50">Default flat rate (cents, optional)</p>
            <Input value={form.defaultFlatRateCents} onChange={(e) => setForm((p) => ({ ...p, defaultFlatRateCents: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-white/50">Flat rate max users (optional)</p>
            <Input value={form.defaultFlatRateMaxUsers} onChange={(e) => setForm((p) => ({ ...p, defaultFlatRateMaxUsers: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-white/50">Invoice due days</p>
            <Input value={form.paymentDueDays} onChange={(e) => setForm((p) => ({ ...p, paymentDueDays: e.target.value }))} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || isPending}>
              {saveMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gray-900 border border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Billing operations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => snapshotMutation.mutate()} disabled={snapshotMutation.isPending}>
            {snapshotMutation.isPending ? "Running..." : "Run daily usage snapshot"}
          </Button>
          <Button variant="outline" onClick={() => invoiceMutation.mutate()} disabled={invoiceMutation.isPending}>
            {invoiceMutation.isPending ? "Running..." : "Generate previous month invoices"}
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-white/50">
        This is the global postpaid default model. Organizations can still override these defaults on their org detail page.
      </p>
    </div>
  );
}
