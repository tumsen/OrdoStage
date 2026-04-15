import { z } from "zod";

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
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreatePersonSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
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
