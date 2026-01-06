import "server-only";

/**
 * Ticket status values (defaults + custom)
 */
export type TicketStatus = "open" | "in_progress" | "resolved" | "closed" | string;

/**
 * Ticket priority values (defaults + custom)
 */
export type TicketPriority = "low" | "medium" | "high" | "urgent" | string;

/**
 * Database row from tickets table
 */
export type TicketRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  call_id: string | null;
  subject: string;
  status: string;
  priority: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Lead summary (minimal fields for list view)
 */
export type LeadSummary = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string | null;
};

/**
 * Call summary (minimal fields for list/detail view)
 */
export type CallSummary = {
  id: string;
  started_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  outcome: string | null;
  agent_id: string | null;
};

/**
 * Agent name lookup
 */
export type AgentSummary = {
  id: string;
  name: string | null;
};

/**
 * Ticket with related data for list view
 */
export type TicketListItem = {
  ticket: TicketRow;
  lead: LeadSummary | null;
  call: CallSummary | null;
  agent: AgentSummary | null;
};

/**
 * Ticket with full related data for detail view
 */
export type TicketDetail = {
  ticket: TicketRow;
  lead: LeadSummary | null;
  call: CallSummary | null;
  agent: AgentSummary | null;
};

/**
 * List tickets query parameters
 */
export type ListTicketsParams = {
  orgId: string;
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
  priority?: string;
  sortBy?: "created_at" | "updated_at";
  sortOrder?: "asc" | "desc";
};

/**
 * List tickets result
 */
export type ListTicketsResult = {
  rows: TicketListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Create ticket input
 */
export type CreateTicketInput = {
  orgId: string;
  leadId?: string | null;
  callId?: string | null;
  subject: string;
  description?: string | null;
  status?: string;
  priority?: string;
};

/**
 * Update ticket input
 */
export type UpdateTicketInput = {
  orgId: string;
  ticketId: string;
  patch: {
    subject?: string;
    description?: string | null;
    status?: string;
    priority?: string;
  };
  /**
   * Source of the update to determine activity logging behavior
   * - "dropdown": Status/priority changed via dropdown → log status_changed/priority_changed
   * - "primary_action": Close/reopen via primary button → log resolved/reopened (not status_changed)
   * - "other": Default for other sources → log status_changed
   */
  source?: "dropdown" | "primary_action" | "other";
};

