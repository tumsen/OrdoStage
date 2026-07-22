import { useState } from "react";
import { ChevronDown, ChevronRight, Mail, Phone, MapPin, X } from "lucide-react";
import type { Person } from "@/lib/types";
import { appleMapsUrl, formatAddress, googleMapsUrl } from "@/components/AddressFields";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function DetailRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | null;
  children?: React.ReactNode;
}) {
  if (!children && !value?.trim()) return null;
  return (
    <div className="contents">
      <dt className="text-white/40">{label}</dt>
      <dd className="break-words text-white/75">{children ?? value}</dd>
    </div>
  );
}

function affiliationLabel(affiliation: Person["affiliation"]): string {
  if (affiliation === "external") return "External";
  if (affiliation === "internal") return "Internal";
  return affiliation;
}

export function PersonAssignmentCard({
  person,
  assignmentRole,
  onRemove,
  defaultOpen = false,
  headerExtra,
  removeDisabled,
}: {
  person: Person;
  /** Role on this event/tour (overrides person.role in the header when set). */
  assignmentRole?: string | null;
  onRemove?: () => void;
  defaultOpen?: boolean;
  headerExtra?: React.ReactNode;
  removeDisabled?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const eventRole = assignmentRole?.trim() || "";
  const personRole = person.role?.trim() || "";
  const headerRole = eventRole || personRole || "No role";
  const collapsedHint = [person.phone?.trim(), person.email?.trim()].filter(Boolean).join(" · ");

  const teamsLabel =
    person.teams && person.teams.length > 0
      ? person.teams
          .map((team) => {
            const membership = person.teamMemberships?.find((entry) => entry.teamId === team.id);
            return membership?.role ? `${team.name} (${membership.role})` : team.name;
          })
          .join(", ")
      : null;

  const addressParts = {
    street: person.addressStreet,
    number: person.addressNumber,
    zip: person.addressZip,
    city: person.addressCity,
    state: person.addressState,
    country: person.addressCountry,
  };
  const addressLine = formatAddress(addressParts);
  const hasAddress = Boolean(
    person.addressStreet?.trim() || person.addressCity?.trim() || person.addressCountry?.trim()
  );

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden"
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 text-left rounded-md py-0.5 -my-0.5 px-1 -mx-1 hover:bg-white/[0.04]"
          >
            {open ? (
              <ChevronDown size={16} className="text-white/45 shrink-0 mt-0.5" />
            ) : (
              <ChevronRight size={16} className="text-white/45 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white/90">{person.name}</div>
              <div className="text-xs text-white/40 mt-0.5">{headerRole}</div>
              {!open && collapsedHint ? (
                <div className="text-xs text-white/30 mt-0.5 truncate">{collapsedHint}</div>
              ) : null}
              {!open ? (
                <div className="text-[10px] text-white/30 mt-0.5">Expand for full details</div>
              ) : null}
            </div>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-1 shrink-0">
          {headerExtra}
          {onRemove ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              disabled={removeDisabled}
              className="h-7 w-7 text-white/25 hover:text-red-400"
              aria-label={`Remove ${person.name}`}
            >
              <X size={13} />
            </Button>
          ) : null}
        </div>
      </div>

      <CollapsibleContent className="border-t border-white/[0.06] px-4 py-3">
        <dl className="grid w-full min-w-0 grid-cols-[minmax(4.5rem,auto)_1fr] gap-x-3 gap-y-2 text-[11px] leading-snug">
          {eventRole && personRole && eventRole !== personRole ? (
            <>
              <DetailRow label="Assignment" value={eventRole} />
              <DetailRow label="Person role" value={personRole} />
            </>
          ) : (
            <DetailRow label="Role" value={headerRole === "No role" ? null : headerRole} />
          )}
          <DetailRow label="Affiliation" value={affiliationLabel(person.affiliation)} />
          {person.email?.trim() ? (
            <DetailRow label="Email">
              <a
                href={`mailto:${person.email.trim()}`}
                className="text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                <Mail size={10} className="shrink-0" />
                {person.email.trim()}
              </a>
            </DetailRow>
          ) : null}
          {person.phone?.trim() ? (
            <DetailRow label="Phone">
              <a
                href={`tel:${person.phone.trim()}`}
                className="text-blue-300 hover:text-blue-200 inline-flex items-center gap-1"
              >
                <Phone size={10} className="shrink-0" />
                {person.phone.trim()}
              </a>
            </DetailRow>
          ) : null}
          {hasAddress ? (
            <DetailRow label="Address">
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={10} className="shrink-0 text-white/40" />
                  {addressLine}
                </span>
                <a
                  href={googleMapsUrl(addressParts)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 hover:text-blue-200"
                >
                  Google Maps
                </a>
                <a
                  href={appleMapsUrl(addressParts)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-300 hover:text-blue-200"
                >
                  Apple Maps
                </a>
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="Teams" value={teamsLabel} />
          {person.workplaceName?.trim() ? (
            <DetailRow label="Workplace" value={person.workplaceName.trim()} />
          ) : null}
          {person.workAddressStreet || person.workAddressCity || person.workAddressCountry ? (
            <DetailRow label="Work address">
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  {formatAddress({
                    street: person.workAddressStreet,
                    number: person.workAddressNumber,
                    zip: person.workAddressZip,
                    city: person.workAddressCity,
                    state: person.workAddressState,
                    country: person.workAddressCountry,
                  })}
                </span>
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
              </span>
            </DetailRow>
          ) : null}
          {(person.emergencyContacts && person.emergencyContacts.length > 0) ||
          person.emergencyContactName?.trim() ||
          person.emergencyContactPhone?.trim() ? (
            <DetailRow label="Emergency">
              <div className="space-y-0.5">
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
                  <div key={contact.id}>
                    {[contact.name, contact.phone, contact.relationNote]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                ))}
              </div>
            </DetailRow>
          ) : null}
          <DetailRow label="Notes" value={person.notes?.trim() || null} />
          {person.isActive === false ? <DetailRow label="Status" value="Inactive" /> : null}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}
