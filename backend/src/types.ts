import { z } from "zod";

export const LanguageSchema = z.enum(["en", "da", "de"]);
export const TimeFormatSchema = z.enum(["12h", "24h"]);
export const DistanceUnitSchema = z.enum(["km", "mi"]);

export const UserPreferencesSchema = z.object({
  language: LanguageSchema,
  timeFormat: TimeFormatSchema,
  distanceUnit: DistanceUnitSchema,
});

export const PreferencesPayloadSchema = z.object({
  organizationDefaults: UserPreferencesSchema,
  userPreferences: UserPreferencesSchema,
  effective: UserPreferencesSchema,
});

export const CustomFieldSchema = z.object({
  key: z.string().min(1),
  value: z.string().optional().default(""),
});

export const RiderVisibilitySchema = z.object({
  venue: z.boolean().default(true),
  schedule: z.boolean().default(true),
  crew: z.boolean().default(true),
  technicalRequirements: z.boolean().default(true),
  venueContact: z.boolean().default(true),
  hotel: z.boolean().default(true),
  notes: z.boolean().default(true),
  managerContact: z.boolean().default(true),
  customFields: z.boolean().default(true),
});

// Department
export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  createdAt: z.string(),
});

export const CreateDepartmentSchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

export const UpdateDepartmentSchema = CreateDepartmentSchema.partial();

export const AddDepartmentMemberSchema = z.object({
  personId: z.string().min(1),
  role: z.string().nullable().optional(),
});

export const UpdateDepartmentMemberRoleSchema = z.object({
  role: z.string().nullable().optional(),
});

export const DepartmentMemberSchema = z.object({
  personId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  defaultRole: z.string().nullable(),
  roleInTeam: z.string().nullable(),
});

// Venue
export const VENUE_DOCUMENT_KINDS = ["drawing", "image", "document", "other"] as const;
export type VenueDocumentKind = (typeof VENUE_DOCUMENT_KINDS)[number];

export const UpdateVenueDocumentSchema = z
  .object({
    name: z.string().min(1).max(500).optional(),
    kind: z.enum(VENUE_DOCUMENT_KINDS).optional(),
  })
  .refine((b) => b.name !== undefined || b.kind !== undefined, {
    message: "At least one of name or kind is required",
  });

export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressStreet:  z.string().nullable(),
  addressNumber:  z.string().nullable(),
  addressZip:     z.string().nullable(),
  addressCity:    z.string().nullable(),
  addressState:   z.string().nullable(),
  addressCountry: z.string().nullable(),
  capacity: z.number().nullable(),
  width: z.string().nullable(),
  length: z.string().nullable(),
  height: z.string().nullable(),
  contactPersonName: z.string().nullable(),
  contactPersonEmail: z.string().nullable(),
  contactPersonPhone: z.string().nullable(),
  contactPersonRole: z.string().nullable(),
  contactCompanyName: z.string().nullable(),
  contactCompanyVat: z.string().nullable(),
  customFields: z.array(CustomFieldSchema),
  notes: z.string().nullable(),
  /** Present on list/detail from API when included. */
  documentCount: z.number().optional(),
  /** Latest files (metadata only) for list thumbnails — max count set by API. */
  documentThumbnails: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(VENUE_DOCUMENT_KINDS),
        name: z.string(),
        filename: z.string(),
        mimeType: z.string(),
      })
    )
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const VenueDocumentSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  kind: z.enum(VENUE_DOCUMENT_KINDS),
  filename: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});

const VenueDimensionInputSchema = z
  .string()
  .max(24)
  .optional()
  .refine(
    (s) => !s || !s.trim() || /^(\d{1,3})([.,]\d{1,2})?(\s*[mM])?$/.test(s.trim()),
    "Dimension must be at most 999,99 m",
  );

export const CreateVenueSchema = z.object({
  name: z.string().min(1),
  addressStreet:  z.string().optional(),
  addressNumber:  z.string().optional(),
  addressZip:     z.string().optional(),
  addressCity:    z.string().optional(),
  addressState:   z.string().optional(),
  addressCountry: z.string().optional(),
  capacity: z.number().optional(),
  width: VenueDimensionInputSchema,
  length: VenueDimensionInputSchema,
  height: VenueDimensionInputSchema,
  contactPersonName: z.string().max(120).optional(),
  contactPersonEmail: z
    .string()
    .max(254)
    .optional()
    .refine((v) => !v || !v.trim() || z.string().email().safeParse(v.trim()).success, "Invalid contact email"),
  contactPersonPhone: z.string().max(40).optional(),
  contactPersonRole: z.string().max(120).optional(),
  contactCompanyName: z.string().max(200).optional(),
  contactCompanyVat: z.string().max(64).optional(),
  customFields: z.array(CustomFieldSchema).optional(),
  notes: z.string().optional(),
});

export const UpdateVenueSchema = CreateVenueSchema.partial();

// Person
export const PersonTeamMembershipSchema = z.object({
  teamId: z.string(),
  role: z.string().nullable(),
});

export const PersonAffiliationSchema = z.enum(["internal", "external"]);

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  affiliation: PersonAffiliationSchema,
  email: z.string().nullable(),
  phone: z.string().nullable(),
  addressStreet:  z.string().nullable(),
  addressNumber:  z.string().nullable(),
  addressZip:     z.string().nullable(),
  addressCity:    z.string().nullable(),
  addressState:   z.string().nullable(),
  addressCountry: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  notes: z.string().nullable().optional(),
  hasPhoto: z.boolean().optional(),
  photoUpdatedAt: z.string().nullable().optional(),
  departmentId: z.string().nullable(),
  teamIds: z.array(z.string()),
  teams: z.array(DepartmentSchema),
  teamMemberships: z.array(PersonTeamMembershipSchema),
  permissionGroupId: z.string().nullable().optional(),
  permissionGroup: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable()
    .optional(),
  isActive: z.boolean(),
  /** Work contract — set by admins with time.read_all. */
  weeklyContractHours: z.number().nullable().optional(),
  vacationDaysPerYear: z.number().nullable().optional(),
  /** ISO timestamp when login invitation email was last sent (null = never). */
  appLoginEmailSentAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Set on send-login endpoint response only (not stored in DB). */
  accountSetupEmail: z
    .object({
      status: z.enum(["sent", "failed", "skipped"]),
      error: z.string().optional(),
      createdUser: z.boolean().optional(),
    })
    .optional(),
  /** Present on list: most urgent dated doc, or a “forever” doc if only those exist. */
  documentExpiryHint: z
    .union([
      z.object({ name: z.string(), forever: z.literal(true) }),
      z.object({ name: z.string(), daysLeft: z.number(), expired: z.boolean() }),
    ])
    .nullable()
    .optional(),
  /** All documents (GET /api/people list) for list cards. */
  documentSummaries: z
    .array(
      z.union([
        z.object({ name: z.string(), type: z.string().optional(), forever: z.literal(true) }),
        z.object({ name: z.string(), type: z.string().optional(), noExpiry: z.literal(true) }),
        z.object({ name: z.string(), type: z.string().optional(), daysLeft: z.number(), expired: z.boolean() }),
      ]),
    )
    .optional(),
});

export const PersonDocumentSchema = z.object({
  id: z.string(),
  personId: z.string(),
  name: z.string(),
  type: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  /** ISO datetime, or null if no specific date. */
  expiresAt: z.string().datetime().nullable().optional(),
  doesNotExpire: z.boolean().default(false),
  /** People/teams explicitly allowed to view/download this document. Empty = owner/admin only. */
  allowedTeamIds: z.array(z.string()).optional(),
  allowedPersonIds: z.array(z.string()).optional(),
  createdAt: z.string(),
});

export const UpdatePersonDocumentSchema = z.object({
  name: z.string().min(1).optional(),
  /** Category label (e.g. image, passport, contract). */
  type: z.string().min(1).max(80).optional(),
  /** YYYY-MM-DD, ISO 8601 string, or null to clear. */
  expiresAt: z.union([z.string().min(1), z.null()]).optional(),
  doesNotExpire: z.boolean().optional(),
});

export const UpdatePersonDocumentVisibilitySchema = z.object({
  teamIds: z.array(z.string()).default([]),
  personIds: z.array(z.string()).default([]),
});

/** Each row picks an existing team (teamId) or creates one by name (newTeamName). */
export const TeamAssignmentInputSchema = z.object({
  teamId: z.string().optional(),
  newTeamName: z.string().optional(),
  role: z.string().optional(),
});

export type TeamAssignmentInput = z.infer<typeof TeamAssignmentInputSchema>;

export const CreatePersonSchema = z
  .object({
    name: z.string().min(1),
    affiliation: PersonAffiliationSchema,
    role: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    addressStreet: z.string().optional(),
    addressNumber: z.string().optional(),
    addressZip: z.string().optional(),
    addressCity: z.string().optional(),
    addressState: z.string().optional(),
    addressCountry: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    notes: z.string().optional(),
    /** Required for every person (exactly one permission group). */
    permissionGroupId: z.string().min(1),
    teamAssignments: z
      .array(TeamAssignmentInputSchema)
      .default([])
      .superRefine((rows, ctx) => {
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const hasId = Boolean(r.teamId?.trim());
          const hasNew = Boolean(r.newTeamName?.trim());
          if (hasId && hasNew) {
            ctx.addIssue({
              code: "custom",
              message: "Use either an existing team or a new team name per row",
              path: ["teamAssignments", i],
            });
          }
        }
      }),
  })
  .superRefine((data, ctx) => {
    if (!data.permissionGroupId?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Permission group is required.",
        path: ["permissionGroupId"],
      });
    }
  });

export const PersonActiveSchema = z.object({
  active: z.boolean(),
});

/** All fields optional; must not use `CreatePersonSchema.partial()` — Zod v4 disallows `.partial()` on refined object schemas. */
export const UpdatePersonSchema = z
  .object({
    name: z.string().min(1).optional(),
    affiliation: PersonAffiliationSchema.optional(),
    /** Clear profile default role on People (PUT body); team memberships unchanged. */
    role: z.union([z.string(), z.null()]).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    addressStreet: z.string().optional(),
    addressNumber: z.string().optional(),
    addressZip: z.string().optional(),
    addressCity: z.string().optional(),
    addressState: z.string().optional(),
    addressCountry: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    notes: z.string().optional(),
    permissionGroupId: z.string().min(1).nullable().optional(),
    teamAssignments: z
      .array(TeamAssignmentInputSchema)
      .optional()
      .superRefine((rows, ctx) => {
        if (rows === undefined) return;
        // Update allows none/multiple teams.
        for (let i = 0; i < rows.length; i++) {
          const r = rows[i];
          if (!r) continue;
          const hasId = Boolean(r.teamId?.trim());
          const hasNew = Boolean(r.newTeamName?.trim());
          if (hasId && hasNew) {
            ctx.addIssue({
              code: "custom",
              message: "Use either an existing team or a new team name per row",
              path: ["teamAssignments", i],
            });
          }
        }
      }),
  });

// Event
export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  /** Null when the event has no schedule window (e.g. no shows yet). */
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  venueId: z.string().nullable(),
  tags: z.string().nullable(),
  contactPerson: z.string().nullable(),
  getInTime: z.string().nullable(),
  setupTime: z.string().nullable(),
  stageSize: z.string().nullable(),
  actorCount: z.number().nullable(),
  allergies: z.string().nullable(),
  customFields: z.string().nullable(),
  ownerTeamId: z.string().nullable().optional(),
  leadPersonId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EventTeamSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  teamId: z.string(),
  isOwner: z.boolean(),
  createdAt: z.string(),
  team: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
  }),
});

export const EventTeamNoteSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  fromTeamId: z.string(),
  toTeamId: z.string(),
  body: z.string(),
  createdByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateEventTeamNoteSchema = z.object({
  fromTeamId: z.string().min(1),
  toTeamId: z.string().min(1),
  body: z.string().min(1),
});

export const UpdateEventTeamNoteSchema = z.object({
  body: z.string().min(1),
});

export const EventShowStaffingSchema = z.object({
  id: z.string(),
  showId: z.string(),
  personId: z.string(),
  departmentId: z.string().nullable().optional(),
  isLead: z.boolean().default(false),
  role: z.string().nullable(),
  meetingTime: z.string().nullable(),
  meetingDurationMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  person: PersonSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const EventShowJobSchema = z.object({
  id: z.string(),
  showId: z.string(),
  title: z.string(),
  jobDate: z.string(),
  startTime: z.string(),
  durationMinutes: z.number(),
  venueId: z.string(),
  venue: VenueSchema,
  departmentId: z.string().nullable().optional(),
  personId: z.string().nullable(),
  person: PersonSchema.nullable().optional(),
  /** All people assigned to this job (by slot index). */
  people: z.array(PersonSchema).optional(),
  /** Required headcount; UI shows this many assignment dropdowns. */
  peopleNeeded: z.number().int().min(1),
  /** Person id per slot (length = peopleNeeded); null = empty slot. */
  slotPersonIds: z.array(z.string().nullable()).optional(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateEventShowJobSchema = z.object({
  title: z.string().min(1),
  jobDate: z.string().min(1),
  startTime: z.string().min(1),
  durationMinutes: z.number().int().min(1),
  venueId: z.string().min(1),
  departmentId: z.string().nullable().optional(),
  personId: z.string().nullable().optional(),
  personIds: z.array(z.string().min(1)).optional(),
  peopleNeeded: z.number().int().min(1).max(99).optional(),
  slotPersonIds: z.array(z.string().nullable()).optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateEventShowJobSchema = CreateEventShowJobSchema.partial();

export const AddEventShowJobPersonSchema = z.object({
  personId: z.string().min(1),
});

export const CopyEventShowJobSchema = z.object({
  keepPeople: z.boolean().optional().default(true),
});

export const EventShowSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  showDate: z.string(),
  showTime: z.string(),
  durationMinutes: z.number(),
  status: z.enum(["draft", "confirmed", "cancelled"]),
  venueId: z.string(),
  venue: VenueSchema,
  technicalNotes: z.string().nullable(),
  fohNotes: z.string().nullable(),
  ticketNotes: z.string().nullable(),
  hospitalityNotes: z.string().nullable(),
  teamResponsibleId: z.string().nullable(),
  teamResponsible: PersonSchema.nullable().optional(),
  getInTime: z.string().nullable(),
  getInDurationMinutes: z.number().nullable(),
  getOutTime: z.string().nullable(),
  getOutDurationMinutes: z.number().nullable(),
  rehearsalTime: z.string().nullable(),
  rehearsalDurationMinutes: z.number().nullable(),
  soundcheckTime: z.string().nullable(),
  soundcheckDurationMinutes: z.number().nullable(),
  breakTime: z.string().nullable(),
  breakDurationMinutes: z.number().nullable(),
  notes: z.string().nullable(),
  /** departmentId -> signed off */
  staffingOkByDepartment: z.record(z.string(), z.boolean()).nullable().optional(),
  ticketsOnSale: z.number().int().nullable().optional(),
  soldTickets: z.number().int().nullable().optional(),
  soldTicketsRecordedAt: z.string().nullable().optional(),
  staffing: z.array(EventShowStaffingSchema),
  jobs: z.array(EventShowJobSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateEventShowSchema = z.object({
  showDate: z.string().min(1),
  showTime: z.string().min(1),
  durationMinutes: z.number().int().min(1),
  venueId: z.string().min(1),
  status: z.enum(["draft", "confirmed", "cancelled"]).optional(),
  technicalNotes: z.string().optional(),
  fohNotes: z.string().optional(),
  ticketNotes: z.string().optional(),
  hospitalityNotes: z.string().optional(),
  teamResponsibleId: z.string().optional(),
  notes: z.string().optional(),
  staffingOkByDepartment: z.record(z.string(), z.boolean()).optional(),
  ticketsOnSale: z.number().int().min(0).nullable().optional(),
  soldTickets: z.number().int().min(0).nullable().optional(),
});

/** Legacy per-show timing slots (DB columns). Optional on update only; not used by the current UI. */
const EventShowLegacySlotFields = z
  .object({
    getInTime: z.string().nullable().optional(),
    getInDurationMinutes: z.number().int().min(1).nullable().optional(),
    getOutTime: z.string().nullable().optional(),
    getOutDurationMinutes: z.number().int().min(1).nullable().optional(),
    rehearsalTime: z.string().nullable().optional(),
    rehearsalDurationMinutes: z.number().int().min(1).nullable().optional(),
    soundcheckTime: z.string().nullable().optional(),
    soundcheckDurationMinutes: z.number().int().min(1).nullable().optional(),
    breakTime: z.string().nullable().optional(),
    breakDurationMinutes: z.number().int().min(1).nullable().optional(),
  })
  .partial();

export const UpdateEventShowSchema = CreateEventShowSchema.partial().merge(EventShowLegacySlotFields);

export const UpsertEventShowStaffingSchema = z.object({
  personId: z.string().min(1),
  departmentId: z.string().nullable().optional(),
  isLead: z.boolean().optional(),
  role: z.string().optional(),
  meetingTime: z.string().optional(),
  meetingDurationMinutes: z.number().int().min(1).optional(),
  notes: z.string().optional(),
});

export const CreateEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  /** Omit or null when the event has no date yet (e.g. before any show exists). */
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  status: z.enum(["draft", "confirmed", "cancelled"]).default("draft"),
  venueId: z.string().optional(),
  tags: z.string().optional(),
  contactPerson: z.string().optional(),
  getInTime: z.string().optional(),
  setupTime: z.string().optional(),
  stageSize: z.string().optional(),
  actorCount: z.number().optional(),
  allergies: z.string().optional(),
  customFields: z.string().optional(),
  ownerTeamId: z.string().optional(),
  leadPersonId: z.string().nullable().optional(),
  teamIds: z.array(z.string()).optional(),
});

export const UpdateEventSchema = CreateEventSchema.partial();
export const AddEventTeamSchema = z.object({ teamId: z.string().min(1) });

// EventPerson
export const EventPersonSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  personId: z.string(),
  role: z.string().nullable(),
  person: PersonSchema,
});

export const AssignPersonSchema = z.object({
  personId: z.string(),
  role: z.string().optional(),
});

// Document
export const DocumentSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  type: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});

// Calendar
export const CalendarSchema = z.object({
  id: z.string(),
  name: z.string(),
  token: z.string(),
  filter: z.string().nullable(),
  icsWallClockZone: z.string(),
});

export const CreateCalendarSchema = z.object({
  name: z.string().min(1),
  filter: z.string().optional(),
  /** IANA zone for ICS wall-clock times; omit to use `X-Client-Time-Zone` or UTC. */
  icsWallClockZone: z.string().max(120).optional(),
});

export const PatchCalendarSchema = z
  .object({
    name: z.string().min(1).optional(),
    filter: z.string().nullable().optional(),
    icsWallClockZone: z.string().max(120).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes" });

// Full event with relations
export const EventDetailSchema = EventSchema.extend({
  venue: VenueSchema.nullable(),
  leadPerson: PersonSchema.nullable().optional(),
  people: z.array(EventPersonSchema),
  documents: z.array(DocumentSchema),
  teams: z.array(EventTeamSchema).optional(),
  teamNotes: z.array(EventTeamNoteSchema).optional(),
  shows: z.array(EventShowSchema),
});

// InternalBooking
export const BookingCreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
});

export const InternalBookingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  type: z.string(),
  venueId: z.string().nullable(),
  eventId: z.string().nullable().optional(),
  isLocked: z.boolean().optional().default(false),
  createdById: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InternalBookingDetailSchema = InternalBookingSchema.extend({
  venue: VenueSchema.nullable(),
  createdBy: BookingCreatorSchema.nullable().optional(),
  people: z.array(
    z.object({
      id: z.string(),
      personId: z.string(),
      role: z.string().nullable(),
      person: PersonSchema,
    })
  ),
});

const internalBookingTypeSchema = z.enum([
  "rehearsal",
  "maintenance",
  "private",
  "venue_booking",
  "other",
]);

const CreateInternalBookingBaseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  /** Omitted on PATCH; default applied only on create (see `CreateInternalBookingSchema`). */
  type: internalBookingTypeSchema.optional(),
  venueId: z.string().optional(),
  eventId: z.string().nullable().optional(),
  isLocked: z.boolean().optional(),
  personIds: z
    .array(z.object({ personId: z.string(), role: z.string().optional() }))
    .optional(),
});

export const CreateInternalBookingSchema = CreateInternalBookingBaseSchema
  .extend({
    type: internalBookingTypeSchema.default("other"),
  })
  .superRefine((data, ctx) => {
  if (data.type !== "venue_booking") return;
  const end = data.endDate?.trim();
  if (!end) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Venue booking requires an end date and time.",
      path: ["endDate"],
    });
    return;
  }
  const a = new Date(data.startDate).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "End date and time must be after the start.",
      path: ["endDate"],
    });
  }
});

export const UpdateInternalBookingSchema = CreateInternalBookingBaseSchema.partial();

// Team management
export const UpdateRoleSchema = z.object({
  role: z.enum(["owner", "manager", "viewer", "member"]),
});

export const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role: z.enum(["manager", "viewer", "member"]),
});

export const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  orgRole: z.string(),
  isActive: z.boolean(),
  departmentId: z.string().nullable(),
  department: DepartmentSchema.nullable(),
  createdAt: z.string(),
});

export const OrganizationInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  orgRole: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

// Type exports
export type Department = z.infer<typeof DepartmentSchema>;
export type CreateDepartment = z.infer<typeof CreateDepartmentSchema>;
export type CustomField = z.infer<typeof CustomFieldSchema>;
export type RiderVisibility = z.infer<typeof RiderVisibilitySchema>;
export type Venue = z.infer<typeof VenueSchema>;
export type CreateVenue = z.infer<typeof CreateVenueSchema>;
export type VenueDocument = z.infer<typeof VenueDocumentSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type PersonDocument = z.infer<typeof PersonDocumentSchema>;
export type PersonTeamMembership = z.infer<typeof PersonTeamMembershipSchema>;
export type CreatePerson = z.infer<typeof CreatePersonSchema>;
export type Event = z.infer<typeof EventSchema>;
export type EventTeam = z.infer<typeof EventTeamSchema>;
export type EventTeamNote = z.infer<typeof EventTeamNoteSchema>;
export type EventShow = z.infer<typeof EventShowSchema>;
export type EventShowJob = z.infer<typeof EventShowJobSchema>;
export type EventShowStaffing = z.infer<typeof EventShowStaffingSchema>;
export type CreateEvent = z.infer<typeof CreateEventSchema>;
export type EventDetail = z.infer<typeof EventDetailSchema>;
export type EventPerson = z.infer<typeof EventPersonSchema>;
export type Document = z.infer<typeof DocumentSchema>;
export type Calendar = z.infer<typeof CalendarSchema>;
export type InternalBooking = z.infer<typeof InternalBookingSchema>;
export type InternalBookingDetail = z.infer<typeof InternalBookingDetailSchema>;
export type CreateInternalBooking = z.infer<typeof CreateInternalBookingSchema>;
export type UpdateInternalBooking = z.infer<typeof UpdateInternalBookingSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

export const TourScheduleEventKindSchema = z.enum([
  "get_in",
  "get_out",
  "show",
  "rehearsal",
  "soundcheck",
  "travel",
  "custom",
]);

export const TourScheduleEventSchema = z.object({
  id: z.string(),
  tourShowId: z.string(),
  kind: TourScheduleEventKindSchema,
  customLabel: z.string().nullable(),
  startTime: z.string(),
  endTime: z.string(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TourScheduleEventInputSchema = z.object({
  kind: TourScheduleEventKindSchema,
  customLabel: z.string().nullable().optional(),
  startTime: z.string(),
  endTime: z.string(),
  sortOrder: z.number().optional(),
});

export const ReplaceTourScheduleEventsSchema = z.object({
  events: z.array(TourScheduleEventInputSchema),
});

// TourShowPerson (defined before TourShowSchema because TourShowSchema references it)
export const TourShowPersonSchema = z.object({
  id: z.string(),
  showId: z.string(),
  personId: z.string(),
  role: z.string().nullable(),
  person: PersonSchema,
});

// TourShow
export const TourShowSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  date: z.string(),
  dayKey: z.string(),
  type: z.enum(["show", "travel", "day_off"]),
  fromLocation: z.string().nullable(),
  toLocation: z.string().nullable(),
  showTime: z.string().nullable(),
  getInTime: z.string().nullable(),
  rehearsalTime: z.string().nullable(),
  soundcheckTime: z.string().nullable(),
  doorsTime: z.string().nullable(),
  venueName:    z.string().nullable(),
  venueStreet:  z.string().nullable(),
  venueNumber:  z.string().nullable(),
  venueZip:     z.string().nullable(),
  venueCity:    z.string().nullable(),
  venueState:   z.string().nullable(),
  venueCountry: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  hotelName:    z.string().nullable(),
  hotelStreet:  z.string().nullable(),
  hotelNumber:  z.string().nullable(),
  hotelZip:     z.string().nullable(),
  hotelCity:    z.string().nullable(),
  hotelState:   z.string().nullable(),
  hotelCountry: z.string().nullable(),
  hotelPhone: z.string().nullable(),
  hotelCheckIn: z.string().nullable(),
  hotelCheckOut: z.string().nullable(),
  travelInfo: z.string().nullable(),
  cateringInfo: z.string().nullable(),
  notes: z.string().nullable(),
  order: z.number(),
  handsNeeded: z.number().nullable(),
  travelTimeMinutes: z.number().nullable(),
  distanceKm: z.number().nullable(),
  techRiderSentAt: z.string().nullable(),
  techRiderSentTo: z.string().nullable(),
  techRiderOpenedAt: z.string().nullable(),
  techRiderOpenCount: z.number(),
  techRiderLastOpenedAt: z.string().nullable(),
  techRiderPdfUrl: z.string().nullable(),
  hasVenueTechRiderPdf: z.boolean(),
  showPeople: z.array(TourShowPersonSchema),
  scheduleEvents: z.array(TourScheduleEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTourShowSchema = z.object({
  date: z.string(),
  dayKey: z.string().optional(),
  type: z.enum(["show", "travel", "day_off"]).optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  showTime: z.string().optional(),
  getInTime: z.string().optional(),
  rehearsalTime: z.string().optional(),
  soundcheckTime: z.string().optional(),
  doorsTime: z.string().optional(),
  venueName:    z.string().optional(),
  venueStreet:  z.string().optional(),
  venueNumber:  z.string().optional(),
  venueZip:     z.string().optional(),
  venueCity:    z.string().optional(),
  venueState:   z.string().optional(),
  venueCountry: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  hotelName:    z.string().optional(),
  hotelStreet:  z.string().optional(),
  hotelNumber:  z.string().optional(),
  hotelZip:     z.string().optional(),
  hotelCity:    z.string().optional(),
  hotelState:   z.string().optional(),
  hotelCountry: z.string().optional(),
  hotelPhone: z.string().optional(),
  hotelCheckIn: z.string().optional(),
  hotelCheckOut: z.string().optional(),
  travelInfo: z.string().optional(),
  cateringInfo: z.string().optional(),
  notes: z.string().optional(),
  order: z.number().optional(),
  handsNeeded: z.number().optional(),
  travelTimeMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
});

export const UpdateTourShowSchema = CreateTourShowSchema.partial();

// TourPersonNote
export const TourPersonNoteSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  showId: z.string(),
  personId: z.string(),
  note: z.string().nullable(),
  needsHotel: z.boolean(),
  person: z.object({ id: z.string(), name: z.string(), role: z.string().nullable() }),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TourPersonNote = z.infer<typeof TourPersonNoteSchema>;

/** Owner admin: bulk email to organization members (POST /api/admin/orgs/:id/email-members). */
export const AdminOrgEmailMembersBodySchema = z
  .object({
    mode: z.enum(["all", "selected"]),
    userIds: z.array(z.string().min(1)).optional(),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(50_000),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "selected" && (!val.userIds || val.userIds.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select at least one user when mode is selected.",
        path: ["userIds"],
      });
    }
  });

export type AdminOrgEmailMembersBody = z.infer<typeof AdminOrgEmailMembersBodySchema>;

export const AdminOrgEmailMembersResultSchema = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  devPreview: z.boolean().optional(),
  skipped: z.number().int().nonnegative().optional(),
  failedEmails: z.array(z.string()).optional(),
});

export type AdminOrgEmailMembersResult = z.infer<typeof AdminOrgEmailMembersResultSchema>;

// TourPerson
export const TourPersonSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  personId: z.string(),
  role: z.string().nullable(),
  personalToken: z.string(),
  person: PersonSchema,
});

export const TourTeamSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  teamId: z.string(),
  team: DepartmentSchema,
});

// Tour
export const TourSchema = z.object({
  id: z.string(),
  shareToken: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(["draft", "active", "completed"]),
  tourManagerName: z.string().nullable(),
  tourManagerPhone: z.string().nullable(),
  tourManagerEmail: z.string().nullable(),
  notes: z.string().nullable(),
  showDuration: z.string().nullable(),
  handsNeeded: z.number().nullable(),
  stageRequirements: z.string().nullable(),
  soundRequirements: z.string().nullable(),
  lightingRequirements: z.string().nullable(),
  riderNotes: z.string().nullable(),
  customFields: z.array(CustomFieldSchema),
  riderVisibility: RiderVisibilitySchema,
  techRiderPdfName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TourDetailSchema = TourSchema.extend({
  shows: z.array(TourShowSchema),
  people: z.array(TourPersonSchema),
  teams: z.array(TourTeamSchema),
  personNotes: z.array(TourPersonNoteSchema),
});

/** Lean tour day row for list/overview (no nested person payloads). */
export const TourShowListRowSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  date: z.string(),
  dayKey: z.string(),
  type: z.enum(["show", "travel", "day_off"]),
  fromLocation: z.string().nullable(),
  toLocation: z.string().nullable(),
  showTime: z.string().nullable(),
  venueName: z.string().nullable(),
  venueCity: z.string().nullable(),
  venueCountry: z.string().nullable(),
  handsNeeded: z.number().nullable(),
  order: z.number(),
  scheduleEvents: z.array(TourScheduleEventSchema),
  showPeopleCount: z.number(),
  techRiderSentAt: z.string().nullable(),
});

export const TourListItemSchema = TourSchema.extend({
  shows: z.array(TourShowListRowSchema),
  tourPeopleCount: z.number(),
  _count: z.object({
    shows: z.number(),
    people: z.number(),
  }),
});

export const AssignTourTeamSchema = z.object({
  teamId: z.string(),
});

// ProductionPerson / ProductionTeam
export const ProductionPersonSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  personId: z.string(),
  role: z.string().nullable(),
  person: PersonSchema,
});

export const ProductionTeamSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  teamId: z.string(),
  team: DepartmentSchema,
});

export const AssignProductionTeamSchema = z.object({
  teamId: z.string(),
});

export const CreateTourSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "completed"]).optional(),
  tourManagerName: z.string().optional(),
  tourManagerPhone: z.string().optional(),
  tourManagerEmail: z.string().optional(),
  notes: z.string().optional(),
  showDuration: z.string().optional(),
  handsNeeded: z.number().optional(),
  stageRequirements: z.string().optional(),
  soundRequirements: z.string().optional(),
  lightingRequirements: z.string().optional(),
  riderNotes: z.string().optional(),
  customFields: z.array(CustomFieldSchema).optional(),
  riderVisibility: RiderVisibilitySchema.partial().optional(),
});

export const UpdateTourSchema = CreateTourSchema.partial();

// —— Time tracking ——

/** Stored as #RRGGBB or null (clients pick a stable fallback when null). */
export const TimeCatalogHexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Expected #RRGGBB");

export const TimeTagSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  color: z.union([TimeCatalogHexColorSchema, z.null()]),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TimeProjectSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  color: z.union([TimeCatalogHexColorSchema, z.null()]),
  eventId: z.string().nullable(),
  eventShowId: z.string().nullable(),
  tourId: z.string().nullable(),
  tourShowId: z.string().nullable(),
  isArchived: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TIME_CATEGORIES = ["work", "vacation", "sick", "holiday", "travel_allowance"] as const;
export type TimeCategory = (typeof TIME_CATEGORIES)[number];

export const TimeEntrySchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  personId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  kind: z.enum(["job", "custom"]),
  category: z.enum(TIME_CATEGORIES).default("work"),
  eventShowJobId: z.string().nullable(),
  eventId: z.string().nullable(),
  tourShowId: z.string().nullable(),
  /** When set, this row maps to a specific tour day schedule line (see `tourevent:<id>` jobs). */
  tourScheduleEventId: z.string().nullable(),
  eventShowStaffingId: z.string().nullable(),
  internalBookingPersonId: z.string().nullable(),
  internalBookingDayKey: z.string().nullable(),
  timeProjectId: z.string().nullable(),
  note: z.string().nullable(),
  isLocked: z.boolean(),
  /** Shared id for rows carved from one drag; metadata PATCH syncs across the group. */
  segmentGroupId: z.string().nullable(),
  tagIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TimeTrackingJobSchema = z.object({
  id: z.string(),
  /** Planned work slot source (event job, show staffing without a job row, tour day, internal booking). */
  source: z.enum(["event", "event_staffing", "tour", "internal_booking"]).default("event"),
  title: z.string(),
  jobDate: z.string(),
  startTime: z.string(),
  durationMinutes: z.number(),
  plannedStartsAt: z.string(),
  plannedEndsAt: z.string(),
  eventId: z.string(),
  eventTitle: z.string(),
  showId: z.string(),
  showDate: z.string(),
  venueName: z.string(),
  timeProjectId: z.string().nullable().optional(),
  tourShowId: z.string().nullable().optional(),
  /** Present when the row is built from a tour day schedule event (`tourevent:<id>`). */
  tourScheduleEventId: z.string().nullable().optional(),
  eventShowStaffingId: z.string().nullable().optional(),
  internalBookingPersonId: z.string().nullable().optional(),
  internalBookingDayKey: z.string().nullable().optional(),
});

export const CreateTimeTagSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().optional(),
  color: z.union([TimeCatalogHexColorSchema, z.null()]).optional(),
});

export const PatchTimeTagSchema = CreateTimeTagSchema.partial();

export const CreateTimeProjectSchema = z.object({
  name: z.string().min(1),
  eventId: z.string().nullable().optional(),
  eventShowId: z.string().nullable().optional(),
  tourId: z.string().nullable().optional(),
  tourShowId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  color: z.union([TimeCatalogHexColorSchema, z.null()]).optional(),
});

export const PatchTimeProjectSchema = z.object({
  name: z.string().min(1).optional(),
  eventId: z.string().nullable().optional(),
  eventShowId: z.string().nullable().optional(),
  tourId: z.string().nullable().optional(),
  tourShowId: z.string().nullable().optional(),
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  color: z.union([TimeCatalogHexColorSchema, z.null()]).optional(),
});

export const CreateTimeEntrySchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  kind: z.enum(["job", "custom"]),
  category: z.enum(TIME_CATEGORIES).optional(),
  eventShowJobId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  tourShowId: z.string().nullable().optional(),
  tourScheduleEventId: z.string().nullable().optional(),
  eventShowStaffingId: z.string().nullable().optional(),
  internalBookingPersonId: z.string().nullable().optional(),
  internalBookingDayKey: z.string().nullable().optional(),
  timeProjectId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  isLocked: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});

export const PatchTimeEntrySchema = z.object({
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  kind: z.enum(["job", "custom"]).optional(),
  category: z.enum(TIME_CATEGORIES).optional(),
  eventShowJobId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  tourShowId: z.string().nullable().optional(),
  tourScheduleEventId: z.string().nullable().optional(),
  eventShowStaffingId: z.string().nullable().optional(),
  internalBookingPersonId: z.string().nullable().optional(),
  internalBookingDayKey: z.string().nullable().optional(),
  timeProjectId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  isLocked: z.boolean().optional(),
  tagIds: z.array(z.string()).optional(),
});

export const TimeTravelClaimSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  personId: z.string(),
  createdByUserId: z.string().nullable(),
  startsAt: z.string(),
  endsAt: z.string(),
  destination: z.string(),
  purpose: z.string(),
  country: z.string(),
  allowanceType: z.enum(["standard", "tour_driver_denmark", "tour_driver_abroad"]),
  rateYear: z.number().int(),
  foodRateCents: z.number().int(),
  lodgingRateCents: z.number().int(),
  breakfastProvided: z.boolean(),
  lunchProvided: z.boolean(),
  dinnerProvided: z.boolean(),
  lodgingAllowance: z.boolean(),
  lodgingCovered: z.boolean(),
  foodCoveredByReceipts: z.boolean(),
  isTemporaryWorkplace: z.boolean(),
  hasUsualResidence: z.boolean(),
  overnightAwayFromHome: z.boolean(),
  cannotReturnHome: z.boolean(),
  twelveMonthRuleOk: z.boolean(),
  salaryReductionAgreement: z.boolean(),
  receivesBIncome: z.boolean(),
  excludedWorkerType: z.boolean(),
  transportsPeopleOrGoods: z.boolean(),
  lodgingByReceipt: z.boolean(),
  dayLines: z.array(z.object({
    date: z.string(),
    city: z.string().optional().default(""),
    hotel: z.string().optional().default(""),
    breakfastProvided: z.boolean().optional().default(false),
    lunchProvided: z.boolean().optional().default(false),
    dinnerProvided: z.boolean().optional().default(false),
    lodgingCovered: z.boolean().optional().default(false),
    lodgingByReceipt: z.boolean().optional().default(false),
  })),
  eventId: z.string().nullable(),
  eventShowJobId: z.string().nullable(),
  timeProjectId: z.string().nullable(),
  notes: z.string().nullable(),
  foodAmountCents: z.number().int(),
  lodgingAmountCents: z.number().int(),
  totalAmountCents: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTimeTravelClaimSchema = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  destination: z.string().min(1),
  purpose: z.string().min(1),
  country: z.string().min(1).default("DK"),
  allowanceType: z.enum(["standard", "tour_driver_denmark", "tour_driver_abroad"]).default("standard"),
  rateYear: z.number().int().optional(),
  breakfastProvided: z.boolean().optional(),
  lunchProvided: z.boolean().optional(),
  dinnerProvided: z.boolean().optional(),
  lodgingAllowance: z.boolean().optional(),
  lodgingCovered: z.boolean().optional(),
  foodCoveredByReceipts: z.boolean().optional(),
  isTemporaryWorkplace: z.boolean().optional(),
  hasUsualResidence: z.boolean().optional(),
  overnightAwayFromHome: z.boolean().optional(),
  cannotReturnHome: z.boolean().optional(),
  twelveMonthRuleOk: z.boolean().optional(),
  salaryReductionAgreement: z.boolean().optional(),
  receivesBIncome: z.boolean().optional(),
  excludedWorkerType: z.boolean().optional(),
  transportsPeopleOrGoods: z.boolean().optional(),
  lodgingByReceipt: z.boolean().optional(),
  dayLines: z.array(z.object({
    date: z.string().min(1),
    city: z.string().optional().default(""),
    hotel: z.string().optional().default(""),
    breakfastProvided: z.boolean().optional().default(false),
    lunchProvided: z.boolean().optional().default(false),
    dinnerProvided: z.boolean().optional().default(false),
    lodgingCovered: z.boolean().optional().default(false),
    lodgingByReceipt: z.boolean().optional().default(false),
  })).optional(),
  eventId: z.string().nullable().optional(),
  eventShowJobId: z.string().nullable().optional(),
  timeProjectId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const PatchTimeTravelClaimSchema = CreateTimeTravelClaimSchema.partial();

export const TimesheetApprovalSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  personId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(["approved", "reopened"]),
  approvedAt: z.string().nullable(),
  approvedByUserId: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  reopenedByUserId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ApproveTimesheetSchema = z.object({
  personId: z.string().optional(),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  note: z.string().nullable().optional(),
});

export const SetPersonContractSchema = z.object({
  weeklyContractHours: z.number().min(0).max(168).nullable().optional(),
  vacationDaysPerYear: z.number().min(0).max(365).nullable().optional(),
});

export const TimeReportPersonSchema = z.object({
  personId: z.string(),
  personName: z.string(),
  totalMinutes: z.number(),
  workMinutes: z.number(),
  vacationMinutes: z.number(),
  sickMinutes: z.number(),
  holidayMinutes: z.number(),
  travelAllowanceMinutes: z.number(),
  weeklyContractHours: z.number().nullable(),
  contractMinutes: z.number().nullable(),
  overtimeMinutes: z.number().nullable(),
  vacationDaysPerYear: z.number().nullable(),
  vacationDaysUsed: z.number().nullable(),
  vacationDaysRemaining: z.number().nullable(),
});

export const TimeReportProjectSchema = z.object({
  projectId: z.string().nullable(),
  projectName: z.string(),
  totalMinutes: z.number(),
  workMinutes: z.number(),
});

export const TimeReportDaySchema = z.object({
  date: z.string(),
  totalMinutes: z.number(),
  workMinutes: z.number(),
  vacationMinutes: z.number(),
  sickMinutes: z.number(),
  holidayMinutes: z.number(),
  travelAllowanceMinutes: z.number(),
});

export const TimeReportEntrySchema = z.object({
  id: z.string(),
  personId: z.string(),
  personName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  durationMinutes: z.number(),
  kind: z.string(),
  category: z.enum(TIME_CATEGORIES),
  note: z.string().nullable(),
  projectId: z.string().nullable(),
  projectName: z.string().nullable(),
  tagIds: z.array(z.string()),
  tagNames: z.array(z.string()),
});

export const TimeReportSchema = z.object({
  summary: z.object({
    totalMinutes: z.number(),
    workMinutes: z.number(),
    vacationMinutes: z.number(),
    sickMinutes: z.number(),
    holidayMinutes: z.number(),
    travelAllowanceMinutes: z.number(),
    entryCount: z.number(),
    rangeDays: z.number(),
  }),
  byPerson: z.array(TimeReportPersonSchema),
  byProject: z.array(TimeReportProjectSchema),
  byDay: z.array(TimeReportDaySchema),
  entries: z.array(TimeReportEntrySchema),
});

export type TimeReport = z.infer<typeof TimeReportSchema>;
export type TimeReportPerson = z.infer<typeof TimeReportPersonSchema>;
export type TimeReportProject = z.infer<typeof TimeReportProjectSchema>;
export type TimeReportDay = z.infer<typeof TimeReportDaySchema>;
export type TimeReportEntry = z.infer<typeof TimeReportEntrySchema>;

export type TimeTag = z.infer<typeof TimeTagSchema>;
export type TimeProject = z.infer<typeof TimeProjectSchema>;
export type TimeEntry = z.infer<typeof TimeEntrySchema>;
export type TimeTrackingJob = z.infer<typeof TimeTrackingJobSchema>;
export type TimeTravelClaim = z.infer<typeof TimeTravelClaimSchema>;
export type TimesheetApproval = z.infer<typeof TimesheetApprovalSchema>;

// Tour type exports
export type TourShow = z.infer<typeof TourShowSchema>;
export type TourScheduleEvent = z.infer<typeof TourScheduleEventSchema>;
export type TourScheduleEventKind = z.infer<typeof TourScheduleEventKindSchema>;
export type CreateTourShow = z.infer<typeof CreateTourShowSchema>;
export type UpdateTourShow = z.infer<typeof UpdateTourShowSchema>;
export type TourPerson = z.infer<typeof TourPersonSchema>;
export type TourTeam = z.infer<typeof TourTeamSchema>;
export type TourShowPerson = z.infer<typeof TourShowPersonSchema>;
export type Tour = z.infer<typeof TourSchema>;
export type TourDetail = z.infer<typeof TourDetailSchema>;
export type TourListItem = z.infer<typeof TourListItemSchema>;
export type TourShowListRow = z.infer<typeof TourShowListRowSchema>;
export type CreateTour = z.infer<typeof CreateTourSchema>;
export type UpdateTour = z.infer<typeof UpdateTourSchema>;
export type AssignTourTeam = z.infer<typeof AssignTourTeamSchema>;
// TourPersonNote is already exported above as a named export

/** Organisation billing plan: Flex (monthly postpaid) or Fixed (annual commitment). */
export const BillingPlanSchema = z.enum(["flex", "fixed"]);
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const PublicPlanQuoteQuerySchema = z.object({
  seats: z.coerce.number().int().min(1).max(150),
});

export const PublicPlanQuoteSchema = z.object({
  seats: z.number().int(),
  flexMonthlyMajor: z.number(),
  fixedMonthlyEquivMajor: z.number(),
  fixedAnnualMonthlyEquivMajor: z.number(),
  fixedAnnualInvoiceMajor: z.number(),
  monthlyDiscountPercent: z.number(),
  /** Annual volume discount % at this seat count (legacy field name). */
  discountPercent: z.number(),
  annualSavingMajor: z.number(),
});
export type PublicPlanQuote = z.infer<typeof PublicPlanQuoteSchema>;

export const FixedCheckoutRequestSchema = z.object({
  seats: z.number().int().min(1).max(200),
});
export const FixedCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url().nullable(),
  annualInvoiceCents: z.number().int(),
  seats: z.number().int(),
  requiresEnterpriseContact: z.boolean().optional(),
});

export const FixedSeatIncreaseRequestSchema = z.object({
  newCommittedSeats: z.number().int().min(1).max(200),
});

export const FixedSeatIncreaseQuoteSchema = z.object({
  currentCommittedSeats: z.number().int(),
  newCommittedSeats: z.number().int(),
  topUpCents: z.number().int(),
  monthsRemainingFraction: z.number(),
  requiresEnterpriseContact: z.boolean(),
});

export const FixedTemporaryPassQuoteRequestSchema = z.object({
  extraSeats: z.number().int().min(1).max(200),
});

export const FixedTemporaryPassQuoteSchema = z.object({
  extraSeats: z.number().int(),
  passDays: z.number().int(),
  pricePerSeatMajor: z.number(),
  totalCents: z.number().int(),
  effectiveCommittedSeats: z.number().int(),
  committedSeats: z.number().int(),
  temporarySeatPassEnabled: z.boolean(),
});

export const FixedTemporaryPassCheckoutRequestSchema = z.object({
  extraSeats: z.number().int().min(1).max(200),
});

export const FixedTemporaryPassCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url().nullable(),
  totalCents: z.number().int(),
  extraSeats: z.number().int(),
  passDays: z.number().int(),
});

export const OpenInvoicePaddleCheckoutResponseSchema = z.object({
  checkoutUrl: z.string().url().nullable(),
  paddleTransactionId: z.string().nullable().optional(),
  paddleInvoiceId: z.string().nullable().optional(),
});

export const OrgBillingPlanSummarySchema = z.object({
  billingPlan: BillingPlanSchema,
  committedSeats: z.number().int().nullable(),
  annualRenewalDate: z.string().nullable(),
  annualTermStartDate: z.string().nullable(),
  annualInvoiceAmountCents: z.number().int().nullable(),
  fixedOverageEstimateCents: z.number().int(),
  fixedAnnualRoundToTen: z.boolean(),
});

// —— Production planner (show creation: set build → premiere → optional tour) ——

export const ProductionStatusSchema = z.enum([
  "planning",
  "in_progress",
  "rehearsal",
  "tech",
  "preview",
  "premiered",
  "on_tour",
  "closed",
]);

export const ProductionPhaseCategorySchema = z.enum([
  "set_build",
  "costume",
  "props",
  "design",
  "rehearsal",
  "tech",
  "marketing",
  "deadline",
  "premiere",
  "other",
]);

export const ProductionPhaseKindSchema = z.enum(["span", "milestone", "deadline"]);

export const ProductionPhaseStatusSchema = z.enum([
  "planned",
  "in_progress",
  "done",
  "cancelled",
]);

export const ProductionCostCategorySchema = z.enum([
  "labor",
  "venue",
  "equipment",
  "travel",
  "marketing",
  "rights",
  "contingency",
  "revenue",
  "other",
]);

export const ProductionPhaseSchema = z.object({
  id: z.string(),
  productionId: z.string(),
  title: z.string(),
  category: ProductionPhaseCategorySchema,
  phaseKind: ProductionPhaseKindSchema,
  status: ProductionPhaseStatusSchema,
  progressPercent: z.number().int().min(0).max(100),
  startDate: z.string(),
  endDate: z.string().nullable(),
  assigneePersonId: z.string().nullable(),
  assigneeName: z.string().nullable().optional(),
  departmentId: z.string().nullable(),
  departmentName: z.string().nullable().optional(),
  dependsOnPhaseId: z.string().nullable(),
  dependsOnPhaseTitle: z.string().nullable().optional(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ProductionSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: ProductionStatusSchema,
  planningStartDate: z.string().nullable(),
  premiereDate: z.string().nullable(),
  closedAt: z.string().nullable(),
  homeVenueId: z.string().nullable(),
  homeVenueName: z.string().nullable().optional(),
  leadPersonId: z.string().nullable(),
  leadPersonName: z.string().nullable().optional(),
  tourId: z.string().nullable(),
  tourName: z.string().nullable().optional(),
  eventId: z.string().nullable(),
  eventTitle: z.string().nullable().optional(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateProductionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: ProductionStatusSchema.optional(),
  planningStartDate: z.string().nullable().optional(),
  premiereDate: z.string().nullable().optional(),
  homeVenueId: z.string().nullable().optional(),
  leadPersonId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  /** Seed default phases (set build, rehearsals, tech, premiere) when premiere date is set. */
  useDefaultPhases: z.boolean().optional(),
});

export const UpdateProductionSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    status: ProductionStatusSchema.optional(),
    planningStartDate: z.string().nullable().optional(),
    premiereDate: z.string().nullable().optional(),
    closedAt: z.string().nullable().optional(),
    homeVenueId: z.string().nullable().optional(),
    leadPersonId: z.string().nullable().optional(),
    tourId: z.string().nullable().optional(),
    eventId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes" });

export const CreateProductionPhaseSchema = z.object({
  title: z.string().min(1),
  category: ProductionPhaseCategorySchema.default("other"),
  phaseKind: ProductionPhaseKindSchema.default("span"),
  status: ProductionPhaseStatusSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  assigneePersonId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  dependsOnPhaseId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateProductionPhaseSchema = z
  .object({
    title: z.string().min(1).optional(),
    category: ProductionPhaseCategorySchema.optional(),
    phaseKind: ProductionPhaseKindSchema.optional(),
    status: ProductionPhaseStatusSchema.optional(),
    progressPercent: z.number().int().min(0).max(100).optional(),
    startDate: z.string().min(1).optional(),
    endDate: z.string().nullable().optional(),
    assigneePersonId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
    dependsOnPhaseId: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes" });

export const ProductionCostLineSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  productionId: z.string(),
  category: ProductionCostCategorySchema,
  label: z.string(),
  plannedCents: z.number().int(),
  actualCents: z.number().int().nullable(),
  currencyCode: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateProductionCostLineSchema = z.object({
  productionId: z.string().min(1),
  category: ProductionCostCategorySchema.default("other"),
  label: z.string().min(1),
  plannedCents: z.number().int().min(0).default(0),
  actualCents: z.number().int().min(0).nullable().optional(),
  currencyCode: z.string().min(3).max(3).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const UpdateProductionCostLineSchema = z
  .object({
    category: ProductionCostCategorySchema.optional(),
    label: z.string().min(1).optional(),
    plannedCents: z.number().int().min(0).optional(),
    actualCents: z.number().int().min(0).nullable().optional(),
    currencyCode: z.string().min(3).max(3).optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "No changes" });

export const ProductionPlannerTaskCategorySchema = ProductionPhaseCategorySchema.or(
  z.enum(["cost", "planning_window"])
);

export const ProductionPlannerTaskSchema = z.object({
  id: z.string(),
  phaseId: z.string().nullable().optional(),
  label: z.string(),
  category: z.string(),
  phaseKind: ProductionPhaseKindSchema.optional(),
  start: z.string(),
  end: z.string(),
  status: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  dependsOnPhaseId: z.string().nullable().optional(),
  dependsOnLabel: z.string().nullable().optional(),
  progressPercent: z.number().int().min(0).max(100).nullable().optional(),
  costPlannedCents: z.number().int().nullable().optional(),
  costActualCents: z.number().int().nullable().optional(),
});

export const ProductionPlannerGanttLineKindSchema = z.enum([
  "summary",
  "phase",
  "cost",
]);

export const ProductionPhaseDocumentSchema = z.object({
  id: z.string(),
  phaseId: z.string(),
  name: z.string(),
  type: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});

export const ProductionPlannerGanttLineSchema = z.object({
  lineId: z.string(),
  kind: ProductionPlannerGanttLineKindSchema,
  label: z.string(),
  category: z.string(),
  status: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  assigneePersonId: z.string().nullable().optional(),
  assigneeName: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
  dependsOnPhaseId: z.string().nullable(),
  dependsOnLabel: z.string().nullable().optional(),
  isCritical: z.boolean().optional(),
  floatDays: z.number().int().optional(),
  task: ProductionPlannerTaskSchema,
});

export const ProductionPlannerCostSummarySchema = z.object({
  currencyCode: z.string(),
  plannedCents: z.number().int(),
  actualCents: z.number().int(),
  varianceCents: z.number().int(),
  loggedLaborMinutes: z.number().int(),
  byCategory: z.array(
    z.object({
      category: ProductionCostCategorySchema,
      plannedCents: z.number().int(),
      actualCents: z.number().int(),
    })
  ),
});

export const ProductionPlannerRowSchema = z.object({
  id: z.string(),
  kind: z.literal("production"),
  title: z.string(),
  status: ProductionStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  premiereDate: z.string().nullable(),
  venueLabel: z.string().nullable().optional(),
  leadPersonId: z.string().nullable().optional(),
  leadPersonName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  linkedTourId: z.string().nullable().optional(),
  linkedTourName: z.string().nullable().optional(),
  linkedEventId: z.string().nullable().optional(),
  linkedEventTitle: z.string().nullable().optional(),
  href: z.string(),
  /** One row per phase (and summary/cost lines) for Gantt display. */
  ganttLines: z.array(ProductionPlannerGanttLineSchema),
  tasks: z.array(ProductionPlannerTaskSchema),
  costs: z.array(ProductionCostLineSchema),
  costSummary: ProductionPlannerCostSummarySchema,
  people: z.array(ProductionPersonSchema),
  teams: z.array(ProductionTeamSchema),
});

export const ProductionPlannerResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  currencyCode: z.string(),
  rows: z.array(ProductionPlannerRowSchema),
  totals: ProductionPlannerCostSummarySchema,
});

export type ProductionStatus = z.infer<typeof ProductionStatusSchema>;
export type ProductionPhaseCategory = z.infer<typeof ProductionPhaseCategorySchema>;
export type ProductionPhaseKind = z.infer<typeof ProductionPhaseKindSchema>;
export type ProductionPhase = z.infer<typeof ProductionPhaseSchema>;
export type Production = z.infer<typeof ProductionSchema>;
export type CreateProduction = z.infer<typeof CreateProductionSchema>;
export type UpdateProduction = z.infer<typeof UpdateProductionSchema>;
export type CreateProductionPhase = z.infer<typeof CreateProductionPhaseSchema>;
export type UpdateProductionPhase = z.infer<typeof UpdateProductionPhaseSchema>;
export type ProductionCostCategory = z.infer<typeof ProductionCostCategorySchema>;
export type ProductionCostLine = z.infer<typeof ProductionCostLineSchema>;
export type CreateProductionCostLine = z.infer<typeof CreateProductionCostLineSchema>;
export type UpdateProductionCostLine = z.infer<typeof UpdateProductionCostLineSchema>;
export type ProductionPlannerTask = z.infer<typeof ProductionPlannerTaskSchema>;
export type ProductionPhaseDocument = z.infer<typeof ProductionPhaseDocumentSchema>;
export type ProductionPlannerGanttLine = z.infer<typeof ProductionPlannerGanttLineSchema>;
export type ProductionPlannerRow = z.infer<typeof ProductionPlannerRowSchema>;
export type ProductionPlannerResponse = z.infer<typeof ProductionPlannerResponseSchema>;
export type ProductionPerson = z.infer<typeof ProductionPersonSchema>;
export type ProductionTeam = z.infer<typeof ProductionTeamSchema>;
export type AssignProductionTeam = z.infer<typeof AssignProductionTeamSchema>;
