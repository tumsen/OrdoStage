import { z } from "zod";

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

// Venue
export const VenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  capacity: z.number().nullable(),
  stageSize: z.string().nullable(),
  ceilingHeight: z.string().nullable(),
  customFields: z.array(CustomFieldSchema),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  capacity: z.number().optional(),
  stageSize: z.string().optional(),
  ceilingHeight: z.string().optional(),
  customFields: z.array(CustomFieldSchema).optional(),
  notes: z.string().optional(),
});

export const UpdateVenueSchema = CreateVenueSchema.partial();

// Person
export const PersonTeamMembershipSchema = z.object({
  teamId: z.string(),
  role: z.string().nullable(),
});

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  emergencyContactName: z.string().nullable(),
  emergencyContactPhone: z.string().nullable(),
  departmentId: z.string().nullable(),
  teamIds: z.array(z.string()),
  teams: z.array(DepartmentSchema),
  teamMemberships: z.array(PersonTeamMembershipSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreatePersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  teamAssignments: z
    .array(
      z.object({
        teamId: z.string(),
        role: z.string().optional(),
      })
    )
    .min(1, "At least one team is required"),
});

export const UpdatePersonSchema = CreatePersonSchema.partial();

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
export const InternalBookingSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  type: z.string(),
  venueId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const InternalBookingDetailSchema = InternalBookingSchema.extend({
  venue: VenueSchema.nullable(),
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
  role: z.enum(["owner", "manager", "viewer"]),
});

export const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  orgRole: z.string(),
  departmentId: z.string().nullable(),
  department: DepartmentSchema.nullable(),
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
  venueName: z.string().nullable(),
  venueAddress: z.string().nullable(),
  venueCity: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  hotelName: z.string().nullable(),
  hotelAddress: z.string().nullable(),
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
  venueName: z.string().optional(),
  venueAddress: z.string().optional(),
  venueCity: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  hotelName: z.string().optional(),
  hotelAddress: z.string().optional(),
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
