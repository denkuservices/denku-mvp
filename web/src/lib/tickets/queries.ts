import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  TicketRow,
  LeadSummary,
  CallSummary,
  AgentSummary,
  TicketListItem,
  TicketDetail,
  ListTicketsParams,
  ListTicketsResult,
} from "./types";

/**
 * List tickets with pagination, filtering, and related data
 * Optimized to avoid N+1 queries
 */
export async function listTickets(params: ListTicketsParams): Promise<ListTicketsResult> {
  const supabase = await createSupabaseServerClient();
  const {
    orgId,
    page = 1,
    pageSize = 50,
    q,
    status,
    priority,
    sortBy = "created_at",
    sortOrder = "desc",
  } = params;

  // 1) Build base query for tickets
  let query = supabase
    .from("tickets")
    .select("id,org_id,lead_id,call_id,subject,status,priority,description,requester_name,requester_phone,requester_email,requester_address,created_at,updated_at", {
      count: "exact",
    })
    .eq("org_id", orgId);

  // Apply filters
  if (status) {
    query = query.eq("status", status);
  }
  if (priority) {
    query = query.eq("priority", priority);
  }

  // Search: subject only (for now - can extend to lead name/phone/email if needed)
  if (q) {
    const searchTerm = q.trim();
    query = query.ilike("subject", `%${searchTerm}%`);
  }

  // Sorting
  query = query.order(sortBy, { ascending: sortOrder === "asc" });

  // Pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data: tickets, error, count } = await query;

  if (error) {
    throw new Error(`Failed to fetch tickets: ${error.message}`);
  }

  const ticketRows = (tickets ?? []) as TicketRow[];

  // 2) Gather unique lead_ids and call_ids
  const leadIds = new Set<string>();
  const callIds = new Set<string>();
  const agentIds = new Set<string>();

  for (const ticket of ticketRows) {
    if (ticket.lead_id) leadIds.add(ticket.lead_id);
    if (ticket.call_id) callIds.add(ticket.call_id);
  }

  // 3) Fetch leads in one query
  let leadsMap: Map<string, LeadSummary> = new Map();
  if (leadIds.size > 0) {
    const { data: leads } = await supabase
      .from("leads")
      .select("id,name,phone,email,source,status")
      .eq("org_id", orgId)
      .in("id", Array.from(leadIds));

    if (leads) {
      for (const lead of leads) {
        leadsMap.set(lead.id, {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          source: lead.source,
          status: lead.status,
        });
      }
    }
  }

  // 4) Fetch calls in one query (to get agent_id)
  let callsMap: Map<string, CallSummary> = new Map();
  if (callIds.size > 0) {
    const { data: calls } = await supabase
      .from("calls")
      .select("id,started_at,duration_seconds,cost_usd,outcome,agent_id")
      .eq("org_id", orgId)
      .in("id", Array.from(callIds));

    if (calls) {
      for (const call of calls) {
        callsMap.set(call.id, {
          id: call.id,
          started_at: call.started_at,
          duration_seconds: call.duration_seconds,
          cost_usd: call.cost_usd,
          outcome: call.outcome,
          agent_id: call.agent_id,
        });
        if (call.agent_id) agentIds.add(call.agent_id);
      }
    }
  }

  // 5) Fetch agents in one query
  let agentsMap: Map<string, AgentSummary> = new Map();
  if (agentIds.size > 0) {
    const { data: agents } = await supabase
      .from("agents")
      .select("id,name")
      .eq("org_id", orgId)
      .in("id", Array.from(agentIds));

    if (agents) {
      for (const agent of agents) {
        agentsMap.set(agent.id, {
          id: agent.id,
          name: agent.name,
        });
      }
    }
  }

  // 6) Build result with related data and apply lead-based search filtering
  let rows: TicketListItem[] = ticketRows.map((ticket) => {
    const lead = ticket.lead_id ? leadsMap.get(ticket.lead_id) ?? null : null;
    const call = ticket.call_id ? callsMap.get(ticket.call_id) ?? null : null;
    const agent = call?.agent_id ? agentsMap.get(call.agent_id) ?? null : null;

    return {
      ticket,
      lead,
      call,
      agent,
    };
  });

  // Apply lead-based search filtering if search term exists
  if (q) {
    const searchTerm = q.toLowerCase().trim();
    rows = rows.filter((item) => {
      // Subject already filtered by DB query, but check again for consistency
      const subjectMatch = item.ticket.subject.toLowerCase().includes(searchTerm);
      
      // Check lead fields
      if (item.lead) {
        const nameMatch = item.lead.name?.toLowerCase().includes(searchTerm) ?? false;
        const phoneMatch = item.lead.phone?.toLowerCase().includes(searchTerm) ?? false;
        const emailMatch = item.lead.email?.toLowerCase().includes(searchTerm) ?? false;
        
        if (subjectMatch || nameMatch || phoneMatch || emailMatch) {
          return true;
        }
      } else if (subjectMatch) {
        return true;
      }
      
      return false;
    });
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Get ticket detail with all related data
 */
export async function getTicketDetail(orgId: string, ticketId: string): Promise<TicketDetail> {
  const supabase = await createSupabaseServerClient();

  // 1) Fetch ticket
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id,org_id,lead_id,call_id,subject,status,priority,description,requester_name,requester_phone,requester_email,requester_address,created_at,updated_at")
    .eq("org_id", orgId)
    .eq("id", ticketId)
    .single();

  if (ticketError || !ticket) {
    throw new Error(`Ticket not found: ${ticketError?.message ?? "Unknown error"}`);
  }

  const ticketRow = ticket as TicketRow;

  // 2) Fetch lead if exists
  let lead: LeadSummary | null = null;
  if (ticketRow.lead_id) {
    const { data: leadData } = await supabase
      .from("leads")
      .select("id,name,phone,email,source,status")
      .eq("org_id", orgId)
      .eq("id", ticketRow.lead_id)
      .maybeSingle();

    if (leadData) {
      lead = {
        id: leadData.id,
        name: leadData.name,
        phone: leadData.phone,
        email: leadData.email,
        source: leadData.source,
        status: leadData.status,
      };
    }
  }

  // 3) Fetch call if exists
  let call: CallSummary | null = null;
  let agent: AgentSummary | null = null;

  if (ticketRow.call_id) {
    const { data: callData } = await supabase
      .from("calls")
      .select("id,started_at,duration_seconds,cost_usd,outcome,agent_id")
      .eq("org_id", orgId)
      .eq("id", ticketRow.call_id)
      .maybeSingle();

    if (callData) {
      call = {
        id: callData.id,
        started_at: callData.started_at,
        duration_seconds: callData.duration_seconds,
        cost_usd: callData.cost_usd,
        outcome: callData.outcome,
        agent_id: callData.agent_id,
      };

      // Fetch agent if exists
      if (callData.agent_id) {
        const { data: agentData } = await supabase
          .from("agents")
          .select("id,name")
          .eq("org_id", orgId)
          .eq("id", callData.agent_id)
          .maybeSingle();

        if (agentData) {
          agent = {
            id: agentData.id,
            name: agentData.name,
          };
        }
      }
    }
  }

  return {
    ticket: ticketRow,
    lead,
    call,
    agent,
  };
}

/**
 * Get distinct status values for filter dropdown
 */
export async function getDistinctStatuses(orgId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("status")
    .eq("org_id", orgId);

  if (error || !data) {
    return ["open", "in_progress", "resolved", "closed"]; // Defaults
  }

  const unique = new Set<string>(data.map((r) => r.status).filter(Boolean));
  return Array.from(unique).sort();
}

/**
 * Get distinct priority values for filter dropdown
 * Always includes defaults: low, medium, high, urgent
 * Merges with any custom values from the database
 * Deduplicates case-insensitively
 */
export async function getDistinctPriorities(orgId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  
  // Default priorities that should always be available (lowercase)
  const defaults = ["low", "medium", "high", "urgent"];
  const defaultsSet = new Set(defaults.map(d => d.toLowerCase()));

  const { data, error } = await supabase
    .from("tickets")
    .select("priority")
    .eq("org_id", orgId);

  if (error || !data) {
    return defaults; // Return defaults if query fails
  }

  // Dedupe case-insensitively: use normalized key (lowercase) but preserve original value
  const seenKeys = new Set<string>();
  const valueMap = new Map<string, string>(); // normalized key -> original value

  // Add defaults first (preserve lowercase)
  for (const def of defaults) {
    const key = def.toLowerCase();
    seenKeys.add(key);
    valueMap.set(key, def);
  }

  // Add custom values from DB (dedupe by normalized key)
  for (const row of data) {
    if (row.priority && typeof row.priority === "string") {
      const normalized = row.priority.trim().toLowerCase();
      if (!seenKeys.has(normalized)) {
        seenKeys.add(normalized);
        // Preserve original casing from DB (or use normalized if not a default)
        valueMap.set(normalized, defaultsSet.has(normalized) ? normalized : row.priority.trim());
      }
    }
  }

  // Sort: defaults first (in order), then custom values alphabetically
  const sorted = Array.from(valueMap.entries()).sort(([keyA, valueA], [keyB, valueB]) => {
    const aIsDefault = defaultsSet.has(keyA);
    const bIsDefault = defaultsSet.has(keyB);
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;
    if (aIsDefault && bIsDefault) {
      return defaults.indexOf(valueA) - defaults.indexOf(valueB);
    }
    return valueA.localeCompare(valueB);
  });

  return sorted.map(([, value]) => value);
}

