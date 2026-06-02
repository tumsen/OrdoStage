import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseTeamRoles, serializeTeamRoles } from "./teamRoles";

export function TeamAddPersonFooter({
  isAdding,
  onAdd,
}: {
  isAdding: boolean;
  onAdd: (roles: string) => void;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  function addTag() {
    const t = newTag.trim();
    if (!t || roles.includes(t)) return;
    setRoles((prev) => [...prev, t]);
    setNewTag("");
  }

  function handleAdd() {
    const serialized = serializeTeamRoles(roles) ?? "";
    onAdd(serialized);
    setRoles([]);
    setNewTag("");
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 space-y-2">
      <div className="space-y-1.5">
        <label className="text-[9px] uppercase tracking-wide text-white/30">Role(s) in this team</label>
        <div className="flex flex-wrap gap-1.5 min-h-[26px]">
          {roles.length === 0 ? (
            <span className="text-[11px] text-white/25 italic">Optional — add roles before joining the team.</span>
          ) : (
            roles.map((r, i) => (
              <span
                key={`${r}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] pl-2.5 pr-1 py-0.5 text-[11px] text-white/85"
              >
                {r}
                <button
                  type="button"
                  disabled={isAdding}
                  className="rounded-full p-0.5 text-white/40 hover:text-white hover:bg-white/10 disabled:opacity-40"
                  onClick={() => setRoles((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove ${r}`}
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center pt-0.5">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (newTag.includes(",")) {
                  const parsed = parseTeamRoles(newTag);
                  setRoles((prev) => {
                    const next = [...prev];
                    for (const t of parsed) {
                      if (!next.includes(t)) next.push(t);
                    }
                    return next;
                  });
                  setNewTag("");
                } else {
                  addTag();
                }
              }
            }}
            disabled={isAdding}
            placeholder="Add a role…"
            className="h-8 flex-1 min-w-[120px] max-w-[220px] text-xs bg-white/5 border-white/10 text-white placeholder:text-white/20"
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8 text-xs bg-white/10 hover:bg-white/15 text-white border-0"
            disabled={isAdding || !newTag.trim() || roles.includes(newTag.trim())}
            onClick={addTag}
          >
            Add role
          </Button>
        </div>
        <p className="text-[10px] text-white/25">
          Comma-separated works too — paste e.g. Lead, Swing, Cover into the field and press Enter.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        className="w-full sm:w-auto bg-red-900/90 hover:bg-red-800 text-white h-9 gap-1.5"
        disabled={isAdding}
        onClick={handleAdd}
      >
        <UserPlus size={14} />
        {isAdding ? "Adding…" : "Add to team"}
      </Button>
    </div>
  );
}
