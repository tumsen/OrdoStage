import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventContactRowFields } from "@/lib/eventContactRow";

const inp = "bg-white/5 border-white/10 text-white h-9 placeholder:text-white/25 focus:border-white/30";

type Props = {
  row: EventContactRowFields;
  onChange: (patch: Partial<EventContactRowFields>) => void;
  notePlaceholder?: string;
};

/** Role, name, phone, email on one row (responsive); note textarea below. */
export function ContactFieldsOneRowNote({ row, onChange, notePlaceholder }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Input
          value={row.role}
          onChange={(e) => onChange({ role: e.target.value })}
          placeholder="Role"
          className={inp}
        />
        <Input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Name"
          className={inp}
        />
        <Input
          value={row.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="Phone"
          className={inp}
        />
        <Input
          type="email"
          value={row.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="Email"
          className={inp}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[10px] text-white/45 uppercase tracking-wide">Note</Label>
        <Textarea
          value={row.note}
          onChange={(e) => onChange({ note: e.target.value })}
          placeholder={notePlaceholder ?? "Additional context…"}
          rows={3}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/25 focus:border-white/30 resize-y min-h-[72px]"
        />
      </div>
    </div>
  );
}
