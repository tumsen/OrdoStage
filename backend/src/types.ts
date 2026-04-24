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
  customFields: z.array(CustomFieldSchema),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateVenueSchema = z.object({
  name: z.string().min(1),
  addressStreet:  z.string().optional(),
  addressNumber:  z.string().optional(),
  addressZip:     z.string().optional(),
  addressCity:    z.string().optional(),
  addressState:   z.string().optional(),
  addressCountry: z.string().optional(),
  capacity: z.number().optional(),
  width: z.string().optional(),
  length: z.string().optional(),
  height: z.string().optional(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const PersonDocumentSchema = z.object({
  id: z.string(),
  personId: z.string(),
  name: z.string(),
  type: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  createdAt: z.string(),
});

/** Each row picks an existing team (teamId) or creates one by name (newTeamName). */
export const TeamAssignmentInputSchema = z.object({
  teamId: z.string().optional(),
  newTeamName: z.string().optional(),
  role: z.string().optional(),
});

export type TeamAssignmentInput = z.infer<typeof TeamAssignmentInputSchema>;

/** Shared row rules for create vs update; Zod v4 forbids `.partial()` on objects with refinements, so update uses this explicitly. */
function refineTeamAssignmentInputRows(
  rows: TeamAssignmentInput[],
  ctx: z.core.$RefinementCtx<TeamAssignmentInput[] | undefined>,
) {
  let anyValid = false;
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
      continue;
    }
    if (hasId || hasNew) anyValid = true;
  }
  if (!anyValid) {
    ctx.addIssue({
      code: "custom",
      message: "Select or add at least one team",
      path: ["teamAssignments"],
    });
  }
}

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
    /** Required when `email` is set — defines app access (permission group / RoleDefinition). */
    permissionGroupId: z.string().min(1).optional(),
    teamAssignments: z
      .array(TeamAssignmentInputSchema)
      .min(1, "At least one team is required")
      .superRefine(refineTeamAssignmentInputRows),
  })
  .superRefine((data, ctx) => {
    if (data.email?.trim() && !data.permissionGroupId?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Select a permission group when the person has an email (required for app access).",
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
        refineTeamAssignmentInputRows(rows, ctx);
      }),
  });

// Event
export const EventSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateEventSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
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
});

export const UpdateEventSchema = CreateEventSchema.partial();

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
});

export const CreateCalendarSchema = z.object({
  name: z.string().min(1),
  filter: z.string().optional(),
});

// Full event with relations
export const EventDetailSchema = EventSchema.extend({
  venue: VenueSchema.nullable(),
  people: z.array(EventPersonSchema),
  documents: z.array(DocumentSchema),
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

export const CreateInternalBookingSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  type: z.enum(["rehearsal", "maintenance", "private", "other"]).default("other"),
  venueId: z.string().optional(),
  personIds: z
    .array(z.object({ personId: z.string(), role: z.string().optional() }))
    .optional(),
});

export const UpdateInternalBookingSchema = CreateInternalBookingSchema.partial();

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
export type Person = z.infer<typeof PersonSchema>;
export type PersonDocument = z.infer<typeof PersonDocumentSchema>;
export type PersonTeamMembership = z.infer<typeof PersonTeamMembershipSchema>;
export type CreatePerson = z.infer<typeof CreatePersonSchema>;
export type Event = z.infer<typeof EventSchema>;
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
  showPeople: z.array(TourShowPersonSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTourShowSchema = z.object({
  date: z.string(),
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

export const AssignTourTeamSchema = z.object({
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

// Tour type exports
export type TourShow = z.infer<typeof TourShowSchema>;
export type CreateTourShow = z.infer<typeof CreateTourShowSchema>;
export type UpdateTourShow = z.infer<typeof UpdateTourShowSchema>;
export type TourPerson = z.infer<typeof TourPersonSchema>;
export type TourTeam = z.infer<typeof TourTeamSchema>;
export type TourShowPerson = z.infer<typeof TourShowPersonSchema>;
export type Tour = z.infer<typeof TourSchema>;
export type TourDetail = z.infer<typeof TourDetailSchema>;
export type CreateTour = z.infer<typeof CreateTourSchema>;
export type UpdateTour = z.infer<typeof UpdateTourSchema>;
export type AssignTourTeam = z.infer<typeof AssignTourTeamSchema>;
// TourPersonNote is already exported above as a named export
