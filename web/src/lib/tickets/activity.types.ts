import "server-only";

/**
 * Ticket activity event types
 */
export type TicketActivityEventType =
  | "ticket.created"
  | "ticket.status_changed"
  | "ticket.priority_changed"
  | "ticket.resolved"
  | "ticket.reopened"
  | "ticket.comment_posted";

/**
 * Ticket activity row from database
 */
export type TicketActivityRow = {
  id: string;
  org_id: string;
  ticket_id: string;
  actor_profile_id: string | null;
  event_type: string;
  summary: string | null;
  diff: Record<string, { before: unknown; after: unknown }> | null;
  created_at: string;
};

/**
 * Profile information for activity actor
 */
export type ActivityActor = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/**
 * Ticket activity with actor information
 */
export type TicketActivity = {
  id: string;
  ticket_id: string;
  actor_profile_id: string | null;
  event_type: string;
  summary: string | null;
  diff: Record<string, { before: unknown; after: unknown }> | null;
  created_at: string;
  actor: ActivityActor | null;
};

/**
 * List ticket activity parameters
 */
export type ListTicketActivityParams = {
  orgId: string;
  ticketId: string;
  limit?: number;
};

/**
 * Log ticket activity input
 */
export type LogTicketActivityInput = {
  orgId: string;
  ticketId: string;
  actorProfileId: string | null;
  eventType: TicketActivityEventType;
  summary?: string | null;
  diff?: Record<string, { before: unknown; after: unknown }> | null;
};

