import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Mail, MapPin, Phone, ShieldAlert, Trash2, User, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import type { Person } from "../../../../backend/src/types";
import { appleMapsUrl, formatAddress, googleMapsUrl } from "@/components/AddressFields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { CircularPhotoEditor } from "@/components/person/CircularPhotoEditor";

const ROLE_COLORS: Record<string, string> = {
  "Tour Manager": "bg-purple-900/40 text-purple-300 border-purple-700/30",
  Actor: "bg-red-900/40 text-red-300 border-red-700/30",
  Tech: "bg-blue-900/40 text-blue-300 border-blue-700/30",
};

function PersonRoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-white/25 text-xs">—</span>;
  const cls = ROLE_COLORS[role] ?? "bg-white/5 text-white/50 border-white/10";
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {role}
    </span>
  );
}

function AffiliationBadge({ affiliation }: { affiliation: Person["affiliation"] }) {
  const internal = affiliation === "internal";
  return (
    <span
      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
        internal
          ? "bg-emerald-950/50 text-emerald-300/90 border-emerald-700/25"
          : "bg-amber-950/40 text-amber-200/85 border-amber-700/25"
      }`}
    >
      {internal ? "Internal" : "External"}
    </span>
  );
}

function formatDocumentTypeForList(t: string | undefined) {
  if (!t) return "";
  return t.replace(/_/g, " ");
}

function PersonListDocumentChips({ items }: { items: Person["documentSummaries"] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 pt-2 border-t border-white/[0.06] w-full min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-white/30 mb-1">Documents</p>
      <div className="flex flex-wrap gap-1">
        {items.map((d, i) => {
          const typeLabel = formatDocumentTypeForList("type" in d ? d.type : undefined);
          const typeSeg = typeLabel ? `${typeLabel} · ` : "";
          if ("forever" in d && d.forever) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-violet-500/40 bg-violet-950/35 px-1.5 py-0.5"
                title={`${d.name} — does not expire`}
              >
                <span className="text-[9px] font-medium text-violet-100/95 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-white/45 leading-tight">{typeSeg}∞</span>
              </div>
            );
          }
          if ("noExpiry" in d && d.noExpiry) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5"
                title={`${d.name} — no date set`}
              >
                <span className="text-[9px] font-medium text-white/75 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-white/35 leading-tight">{typeSeg}No date</span>
              </div>
            );
          }
          if ("expired" in d && d.expired) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-red-500/45 bg-red-950/30 px-1.5 py-0.5"
                title={`${d.name} — expired`}
              >
                <span className="text-[9px] font-medium text-red-100/90 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-red-200/50 leading-tight">{typeSeg}Expired</span>
              </div>
            );
          }
          if ("daysLeft" in d) {
            return (
              <div
                key={`${d.name}-${i}`}
                className="inline-flex flex-col max-w-full rounded border border-emerald-500/40 bg-emerald-950/25 px-1.5 py-0.5"
                title={`${d.name} — ${d.daysLeft === 0 ? "last day" : `${d.daysLeft}d left`}`}
              >
                <span className="text-[9px] font-medium text-emerald-100/90 leading-tight truncate">
                  {d.name}
                </span>
                <span className="text-[8px] text-emerald-200/50 leading-tight">
                  {typeSeg}
                  {d.daysLeft === 0 ? "Last day" : `${d.daysLeft}d left`}
                </span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

export type PersonCardProps = {
  person: Person;
  onEdit: () => void;
  onDelete: () => void;
  canEditPerson: boolean;
  canDeletePerson: boolean;
  canSeeDocumentSummaries: boolean;
  /** Hide the teams line (e.g. on the Teams page). */
  hideTeamsLine?: boolean;
  /** Extra content below person details (e.g. team role editor). */
  footer?: ReactNode;
  /** Trash removes the person; user-minus removes from current team only. */
  deleteAction?: "delete-person" | "remove-from-team";
  /** Show active toggle (People list). Default true. */
  showActiveToggle?: boolean;
};

export function PersonCard({
  person,
  onEdit,
  onDelete,
  canEditPerson,
  canDeletePerson,
  canSeeDocumentSummaries,
  hideTeamsLine = false,
  footer,
  deleteAction = "delete-person",
  showActiveToggle = true,
}: PersonCardProps) {
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const activeMutation = useMutation({
    mutationFn: (nextActive: boolean) =>
      api.patch(`/api/people/${person.id}/active`, { active: nextActive }),
    onSuccess: (_, nextActive) => {
      queryClient.invalidateQueries({ queryKey: ["people"] });
      queryClient.invalidateQueries({ queryKey: ["org"] });
      setDeactivateOpen(false);
      toast({
        title: nextActive ? "Person activated" : "Person deactivated",
      });
    },
    onError: (e: Error) => {
      toast({
        title: e.message || "Could not update status",
        variant: "destructive",
      });
    },
  });

  const isActive = person.isActive !== false;
  const DeleteIcon = deleteAction === "remove-from-team" ? UserMinus : Trash2;

  function onActiveSwitch(checked: boolean) {
    if (!canWrite) return;
    if (checked) {
      activeMutation.mutate(true);
      return;
    }
    setDeactivateOpen(true);
  }

  return (
    <div
      className={`flex items-start gap-4 px-5 py-4 border-b border-white/5 group hover:bg-white/[0.02] transition-colors ${
        !isActive ? "opacity-70" : ""
      }`}
    >
      <div className="w-14 h-14 rounded-full overflow-hidden bg-white/[0.06] border border-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        {person.hasPhoto ? (
          <CircularPhotoEditor
            src={`${import.meta.env.VITE_BACKEND_URL || ""}/api/people/${person.id}/photo?ts=${person.photoUpdatedAt ?? ""}`}
            alt={person.name}
            focusX={person.photoFocusX ?? 50}
            focusY={person.photoFocusY ?? 50}
            zoom={person.photoZoom ?? 100}
            editable={false}
            sizeClassName="h-14 w-14"
          />
        ) : (
          <User size={21} className="text-white/30" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-white/90">{person.name}</span>
          {person.workName?.trim() &&
          person.workName.trim().toLowerCase() !== person.name.trim().toLowerCase() ? (
            <span className="text-xs text-white/45">({person.workName.trim()})</span>
          ) : null}
          <AffiliationBadge affiliation={person.affiliation ?? "internal"} />
          <PersonRoleBadge role={person.role} />
          {!isActive ? (
            <span className="text-[10px] uppercase tracking-wide text-white/35 border border-white/10 rounded px-1.5 py-0">
              Inactive
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
          {!hideTeamsLine && person.teams && person.teams.length > 0 ? (
            <span className="text-xs text-white/35">
              Teams:{" "}
              {person.teams
                .map((team) => {
                  const membership = person.teamMemberships?.find((entry) => entry.teamId === team.id);
                  return membership?.role ? `${team.name} (${membership.role})` : team.name;
                })
                .join(", ")}
            </span>
          ) : null}
          {person.email ? (
            <a
              href={`mailto:${person.email}`}
              className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              <Mail size={10} />
              {person.email}
            </a>
          ) : null}
          {person.workEmail?.trim() &&
          person.workEmail.trim().toLowerCase() !== (person.email ?? "").trim().toLowerCase() ? (
            <a
              href={`mailto:${person.workEmail.trim()}`}
              className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors"
              title="Work email"
            >
              <Mail size={10} />
              {person.workEmail.trim()}
            </a>
          ) : null}
          {person.phone ? (
            <a
              href={`tel:${person.phone}`}
              className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              <Phone size={10} />
              {person.phone}
            </a>
          ) : null}
          {person.workPhone?.trim() &&
          person.workPhone.trim() !== (person.phone ?? "").trim() ? (
            <a
              href={`tel:${person.workPhone.trim()}`}
              className="text-xs text-white/40 hover:text-blue-400 flex items-center gap-1 transition-colors"
              title="Work phone"
            >
              <Phone size={10} />
              {person.workPhone.trim()}
            </a>
          ) : null}
          {person.addressStreet || person.addressCity || person.addressCountry ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/30">
              <span className="flex items-center gap-1">
                <MapPin size={10} />
                {formatAddress({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
              </span>
              <a
                href={googleMapsUrl({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Google Maps
              </a>
              <a
                href={appleMapsUrl({
                  street: person.addressStreet,
                  number: person.addressNumber,
                  zip: person.addressZip,
                  city: person.addressCity,
                  state: person.addressState,
                  country: person.addressCountry,
                })}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 hover:text-blue-200"
              >
                Apple Maps
              </a>
            </div>
          ) : null}
          {person.workplaceName ||
          person.workAddressStreet ||
          person.workAddressCity ||
          person.workAddressCountry ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/30">
              <span className="flex items-center gap-1">
                <MapPin size={10} className="text-sky-400/50" />
                {[
                  person.workplaceName,
                  formatAddress({
                    street: person.workAddressStreet,
                    number: person.workAddressNumber,
                    zip: person.workAddressZip,
                    city: person.workAddressCity,
                    state: person.workAddressState,
                    country: person.workAddressCountry,
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {person.workAddressStreet || person.workAddressCity || person.workAddressCountry ? (
                <a
                  href={googleMapsUrl({
                    street: person.workAddressStreet,
                    number: person.workAddressNumber,
                    zip: person.workAddressZip,
                    city: person.workAddressCity,
                    state: person.workAddressState,
                    country: person.workAddressCountry,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 hover:text-blue-200"
                >
                  Google Maps
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        {(person.emergencyContacts && person.emergencyContacts.length > 0) ||
        person.emergencyContactName ||
        person.emergencyContactPhone ? (
          <div className="mt-1 space-y-0.5">
            {(person.emergencyContacts && person.emergencyContacts.length > 0
              ? person.emergencyContacts
              : [
                  {
                    id: "legacy",
                    name: person.emergencyContactName ?? "",
                    phone: person.emergencyContactPhone ?? "",
                    relationNote: "",
                  },
                ]
            ).map((contact) => (
              <div
                key={contact.id}
                className="text-xs text-white/25 flex items-center gap-1.5 flex-wrap"
              >
                <ShieldAlert size={10} className="text-amber-400/40 shrink-0" />
                <span>
                  {[contact.name, contact.phone, contact.relationNote]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {person.notes ? (
          <div className="mt-1 text-xs text-white/35 line-clamp-2">Notes: {person.notes}</div>
        ) : null}
        {canSeeDocumentSummaries ? <PersonListDocumentChips items={person.documentSummaries} /> : null}
        {footer ? <div className="mt-3 w-full min-w-0">{footer}</div> : null}
      </div>

      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        {showActiveToggle ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/35 uppercase tracking-wide hidden sm:inline">Active</span>
            <Switch
              checked={isActive}
              disabled={!canWrite || activeMutation.isPending}
              onCheckedChange={onActiveSwitch}
              aria-label={isActive ? "Deactivate person" : "Activate person"}
            />
          </div>
        ) : null}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEditPerson ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white"
              onClick={onEdit}
              title="Edit person"
            >
              <Edit2 size={13} />
            </Button>
          ) : null}
          {canDeletePerson ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-red-400"
              onClick={onDelete}
              title={deleteAction === "remove-from-team" ? "Remove from team" : "Delete person"}
            >
              <DeleteIcon size={13} />
            </Button>
          ) : null}
        </div>
      </div>

      {showActiveToggle ? (
        <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
          <AlertDialogContent className="bg-[#16161f] border-white/10 text-white">
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate {person.name}?</AlertDialogTitle>
              <AlertDialogDescription className="text-white/50 space-y-2">
                <p>
                  Inactive contacts stay in your directory but are marked inactive. Reactivating is free.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
                Cancel
              </AlertDialogCancel>
              <Button
                type="button"
                className="bg-red-900 hover:bg-red-800 text-white border border-red-700/50"
                disabled={activeMutation.isPending}
                onClick={() => activeMutation.mutate(false)}
              >
                {activeMutation.isPending ? "Working…" : "Deactivate"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}
