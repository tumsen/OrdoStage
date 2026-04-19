import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api, isApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signOut } from "@/lib/auth-client";

const CONFIRM_PHRASE = "DELETETHISACCOUNT";

export default function Account() {
  const navigate = useNavigate();
  const [phrase, setPhrase] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onDeleteAccount() {
    setError("");
    if (phrase !== CONFIRM_PHRASE) {
      setError(`Type ${CONFIRM_PHRASE} exactly (all caps).`);
      return;
    }
    setLoading(true);
    try {
      await api.delete<undefined>("/api/me/account", {
        body: JSON.stringify({ phrase: CONFIRM_PHRASE }),
        headers: { "Content-Type": "application/json" },
      });
      await signOut();
      navigate("/login");
    } catch (e: unknown) {
      if (isApiError(e)) {
        setError(e.message);
      } else {
        setError("Could not delete account.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold text-white">Account</h2>
        <p className="text-sm text-white/45 mt-1">Security and account deletion.</p>
      </div>

      <div className="rounded-xl border border-red-500/25 bg-red-950/20 p-5 space-y-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">Delete your login account</p>
            <p className="text-xs text-white/50 leading-relaxed">
              This removes your OrdoStage login and sessions. If you are the only member of your organization,
              the organization and its data are deleted. If you are an owner with other members, transfer ownership first
              (Team page).
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="delete-phrase" className="text-white/70 text-xs uppercase tracking-wide">
            Type {CONFIRM_PHRASE} to confirm
          </Label>
          <Input
            id="delete-phrase"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={CONFIRM_PHRASE}
            autoComplete="off"
            className="bg-white/5 border-white/10 text-white placeholder:text-white/25"
          />
        </div>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <Button
          type="button"
          variant="destructive"
          className="w-full bg-red-900 hover:bg-red-800"
          disabled={loading || phrase !== CONFIRM_PHRASE}
          onClick={onDeleteAccount}
        >
          {loading ? "Deleting…" : "Delete my account permanently"}
        </Button>
      </div>
    </div>
  );
}
