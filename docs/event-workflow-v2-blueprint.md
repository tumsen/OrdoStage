# Event Workflow v2 Blueprint

## Goal

Create an event system optimized for real theater/show operations:

- One event can contain zero or many shows.
- Team ownership is explicit and enforceable.
- Cross-team planning is structured (notes, docs, jobs, milestones).
- Permissions are clear at event level and show level.
- Workflow supports draft planning first, then operational execution.

This document defines the product rules and technical model for implementation.

---

## Core Concepts

### Event

An Event is the overall production container (planning, contracts, staffing, communication, docs).

### Show

A Show is one dated execution instance under an Event (date/time/duration + per-team execution planning).

### Owner Team

Each Event has exactly one owner team.

- Owner team can add/remove teams on event
- Owner team can add/edit/delete shows
- Owner team can edit show start/time/duration
- Owner team can delete event

Org Owner/Admin can always override for recovery/safety.

### Event Teams

Other teams are explicitly attached to the event by owner team.
Each attached team gets:

- Event-level tab (general team notes/docs and directed notes)
- Show-level tab for every show (jobs/milestones/team notes/docs)

---

## Required Product Rules

## 1) Lifecycle

Event status:

- `DRAFT` (default, zero shows allowed)
- `PLANNED` (at least one show exists)
- `CONFIRMED` (manually set when planning is ready)
- `RUNNING` (optional auto status when a show is active window)
- `COMPLETED`
- `CANCELLED`

Rules:

- Event can be created without a show.
- Event cannot be confirmed unless at least one show exists.
- Deleting last show moves event back to `DRAFT` (if not cancelled/completed).

## 2) Team Ownership & Access

- Owner team is selected at event creation.
- If Booking team exists, it is preselected as default (editable before save).
- Owner team is persisted as `ownerTeamId` (do not infer from first added row).

## 3) Team Tabs

When a team is added to event:

- Create event-team workspace for that team.
- Show one event-level tab per team.
- For each show, show one show-level tab per team.

## 4) Directed Notes

Notes must support department-to-department communication:

- `fromTeam -> toTeam`
- editable only by `fromTeam` (and Owner/Admin override)
- readable by all event teams (or optionally only sender+receiver if we add a visibility flag later)

## 5) Staffing / Jobs

Show-level team planning supports:

- Add Job: `jobTitle + role + person + startTime + duration + note`
- Add Milestone: `label + dateTime + duration + note`

Jobs can assign any person in org (policy can be tightened later with org setting).

## 6) Documents

At both event-level and show-level, each team can upload docs in their own tab.
Typical docs: contracts, riders, run sheets, FOH sheets, technical docs.

## 7) Tickets (Booking-owned by default)

Booking tracks:

- max tickets
- sold tickets current value
- full edit history (who/when/value before/value after)

---

## Permission Matrix (v2)

`Org Owner/Admin` = always override.

For normal users:

- **Owner team members**
  - can add/remove event teams
  - can create/edit/delete shows
  - can edit show date/time/duration
  - can delete event
  - can edit own team content

- **Non-owner event team members**
  - can edit own team event tab
  - can edit own team show tabs
  - cannot add/remove teams
  - cannot create/delete shows
  - cannot change show core timing
  - cannot delete event

- **Not part of event teams**
  - read access only if org permissions allow events read (configurable)
  - no event/show edits

---

## Data Model (Proposed Prisma Entities)

## `Event` (existing + new fields)

- `id`
- `organizationId`
- `title`
- `description`
- `status` enum
- `ownerTeamId` (FK Department)
- `bookingFieldsJson` (or normalized fields, see implementation note)
- `technicalFieldsJson`
- `fohFieldsJson`
- timestamps

## `EventTeam`

Links team to event.

- `id`
- `eventId`
- `teamId` (Department)
- `isOwner` (bool, exactly one true per event)
- `addedByUserId`
- `createdAt`

Unique: `(eventId, teamId)`

## `EventTeamNote`

Directed event-level note from one team to another.

- `id`
- `eventId`
- `fromTeamId`
- `toTeamId`
- `body`
- `createdByUserId`
- timestamps

## `EventTeamDocument`

Event-level team document.

- `id`
- `eventId`
- `teamId`
- metadata + file blob/ref
- createdBy + timestamps

## `EventShow` (existing, adjusted)

- `id`
- `eventId`
- `showDate`
- `showTime`
- `durationMinutes`
- `venueId`
- `status` (optional show status)
- core notes/timestamps

## `EventShowTeam`

Team workspace under a show.

- `id`
- `showId`
- `teamId`
- createdAt

Unique: `(showId, teamId)`

## `EventShowJob`

- `id`
- `showId`
- `teamId`
- `jobTitle`
- `role`
- `personId` nullable
- `startAt` datetime
- `durationMinutes`
- `note`
- timestamps

## `EventShowMilestone`

- `id`
- `showId`
- `teamId`
- `label`
- `startsAt`
- `durationMinutes`
- `note`
- timestamps

## `EventShowTeamNote`

Directed note at show-level:

- `id`
- `showId`
- `fromTeamId`
- `toTeamId`
- `body`
- `createdByUserId`
- timestamps

## `EventShowTeamDocument`

- `id`
- `showId`
- `teamId`
- metadata + file blob/ref
- createdBy + timestamps

## `EventTicketStatHistory`

- `id`
- `eventId`
- `showId` nullable (if per-show ticketing later)
- `maxTickets` nullable
- `soldTickets` nullable
- `changedByUserId`
- `changedAt`

---

## API Surface (Proposed)

Event core:

- `POST /api/events` (includes ownerTeamId; default DRAFT)
- `GET /api/events/:id`
- `PATCH /api/events/:id` (core fields/status with rule validation)
- `DELETE /api/events/:id` (owner team + owner/admin override only)

Event teams:

- `POST /api/events/:id/teams`
- `DELETE /api/events/:id/teams/:teamId`
- `GET /api/events/:id/teams`

Event-level team content:

- `GET/POST/PATCH/DELETE /api/events/:id/teams/:teamId/documents`
- `GET/POST/PATCH/DELETE /api/events/:id/team-notes`

Shows:

- `POST /api/events/:id/shows`
- `PATCH /api/events/:id/shows/:showId` (owner team only for timing fields)
- `DELETE /api/events/:id/shows/:showId`

Show-level team content:

- `GET/POST/PATCH/DELETE /api/events/:id/shows/:showId/teams/:teamId/jobs`
- `GET/POST/PATCH/DELETE /api/events/:id/shows/:showId/teams/:teamId/milestones`
- `GET/POST/PATCH/DELETE /api/events/:id/shows/:showId/teams/:teamId/documents`
- `GET/POST/PATCH/DELETE /api/events/:id/shows/:showId/team-notes`

Tickets:

- `PATCH /api/events/:id/tickets`
- `GET /api/events/:id/tickets/history`

---

## UX Blueprint

## Event Create

Required:

- title
- owner team (default booking if exists)

Optional:

- venue, description, booking/technical/foh baseline fields

On create: status = DRAFT.

## Event Detail (top-level tabs)

- Overview
- Booking
- Technical
- FOH
- Teams (dynamic tabs per added team)
- Shows
- Documents (global optional)
- Activity/History

## Show Detail

Header:

- date/time/duration/venue (owner team editable)

Tabs:

- Booking (if attached)
- Technical
- FOH
- Dynamic team tabs

Each team tab:

- Jobs list
- Milestones list
- Team docs
- Directed notes

---

## Rollout Plan

## Phase 1 - Backbone

- Add event ownership (`ownerTeamId`) and event status rules
- Add event teams model (`EventTeam`)
- Enforce permission checks on existing show endpoints
- Add migration to keep old events working (auto owner team assignment fallback)

## Phase 2 - Team Workspaces

- Event-level team tabs: notes/documents
- Directed notes model + API
- Team add/remove UI by owner team

## Phase 3 - Show Team Workspaces

- `EventShowTeam`, jobs, milestones, show team docs
- Dynamic show tabs per team
- Ownership restrictions for show timing edits

## Phase 4 - Booking/Tickets + Output

- Ticket history model and UI
- Team-specific PDF export
- Email distribution to team members / assigned people

## Phase 5 - Hardening

- Audit logs
- Conflict handling (concurrent edits)
- Permissions test matrix
- Performance optimization

---

## Migration / Compatibility Strategy

- Existing events should be auto-mapped:
  - set owner team using:
    1) current booking team if identifiable
    2) else first event team relation
    3) else manual prompt for owner/admin on first open
- Existing shows remain but become managed by new permission rules.
- No destructive migration until v2 is validated with real workflows.

---

## Open Decisions (Need Product Confirmation)

1. Should non-owner teams be allowed to edit show-level core notes outside their own tab?
2. Should directed notes be visible to all teams or only sender+receiver?
3. Should job assignment allow any person in org or only team members by default?
4. Should event confirmation require mandatory fields (contract state, venue, etc.) or only show existence?
5. Do we need per-show ticket tracking now, or event-level only first?

---

## Acceptance Criteria for v2 Success

- Owner-team restrictions hold in backend regardless of UI.
- Teams can collaborate without editing each other’s private planning fields.
- Event can start as draft with zero shows.
- Transition from planning to confirmed is explicit and controlled.
- Show day execution data (jobs/milestones/notes/docs) is fast to update.
- Exports/emails can be generated per team without manual cleanup.
