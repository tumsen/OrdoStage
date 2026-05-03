import { useId } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EventContactRowFields } from "@/lib/eventContactRow";

const inp = "bg-white/5 border-white/10 text-white h-9 placeholder:text-white/25 focus:border-white/30";
const lbl = "text-[10px] text-white/45 uppercase tracking-wide";

type Props = {
  row: EventContactRowFields;
  onChange: (patch: Partial<EventContactRowFields>) => void;
  notePlaceholder?: string;
};

/** Role, name, phone, email on one row (responsive) with labels; note textarea below. */
export function ContactFieldsOneRowNote({ row, onChange, notePlaceholder }: Props) {
  const uid = useId();
  const roleId = `${uid}-role`;
  const nameId = `${uid}-name`;
  const phoneId = `${uid}-phone`;
  const emailId = `${uid}-email`;
  const noteId = `${uid}-note`;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-2 gap-y-3">
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={roleId} className={lbl}>
            Role
          </Label>
          <Input
            id={roleId}
            value={row.role}
            onChange={(e) => onChange({ role: e.target.value })}
            placeholder="e.g. Tour manager"
            className={inp}
            autoComplete="organization-title"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={nameId} className={lbl}>
            Name
          </Label>
          <Input
            id={nameId}
            value={row.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Full name"
            className={inp}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={phoneId} className={lbl}>
            Phone
          </Label>
          <Input
            id={phoneId}
            type="tel"
            value={row.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="+45 …"
            className={inp}
            autoComplete="tel"
          />
        </div>
        <div className="space-y-1.5 min-w-0">
          <Label htmlFor={emailId} className={lbl}>
            E-mail
          </Label>
          <Input
            id={emailId}
            type="email"
            value={row.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="name@company.com"
            className={inp}
            autoComplete="email"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={noteId} className={lbl}>
          Note
        </Label>
        <Textarea
          id={noteId}
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
