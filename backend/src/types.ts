import { z } from "zod";

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
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateVenueSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  capacity: z.number().optional(),
  notes: z.string().optional(),
});

export const UpdateVenueSchema = CreateVenueSchema.partial();

// Person
export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  departmentId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreatePersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  departmentId: z.string().nullable().optional(),
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
export type Venue = z.infer<typeof VenueSchema>;
export type CreateVenue = z.infer<typeof CreateVenueSchema>;
export type Person = z.infer<typeof PersonSchema>;
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

// TourShow
export const TourShowSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  date: z.string(),
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
  travelTimeMinutes: z.number().nullable(),
  distanceKm: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTourShowSchema = z.object({
  date: z.string(),
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
  travelTimeMinutes: z.number().optional(),
  distanceKm: z.number().optional(),
});

export const UpdateTourShowSchema = CreateTourShowSchema.partial();

// TourPerson
export const TourPersonSchema = z.object({
  id: z.string(),
  tourId: z.string(),
  personId: z.string(),
  role: z.string().nullable(),
  person: PersonSchema,
});

// Tour
export const TourSchema = z.object({
  id: z.string(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const TourDetailSchema = TourSchema.extend({
  shows: z.array(TourShowSchema),
  people: z.array(TourPersonSchema),
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
});

export const UpdateTourSchema = CreateTourSchema.partial();

// Tour type exports
export type TourShow = z.infer<typeof TourShowSchema>;
export type CreateTourShow = z.infer<typeof CreateTourShowSchema>;
export type UpdateTourShow = z.infer<typeof UpdateTourShowSchema>;
export type TourPerson = z.infer<typeof TourPersonSchema>;
export type Tour = z.infer<typeof TourSchema>;
export type TourDetail = z.infer<typeof TourDetailSchema>;
export type CreateTour = z.infer<typeof CreateTourSchema>;
export type UpdateTour = z.infer<typeof UpdateTourSchema>;
