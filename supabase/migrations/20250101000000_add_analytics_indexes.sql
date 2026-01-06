-- Migration: Add indexes for analytics queries
-- Purpose: Optimize analytics page queries (calls, leads, tickets, appointments)

-- Calls table indexes
CREATE INDEX IF NOT EXISTS idx_calls_org_id_started_at ON calls(org_id, started_at);
CREATE INDEX IF NOT EXISTS idx_calls_org_id_agent_id_started_at ON calls(org_id, agent_id, started_at) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_org_id_outcome_started_at ON calls(org_id, outcome, started_at) WHERE outcome IS NOT NULL;

-- Leads table index
CREATE INDEX IF NOT EXISTS idx_leads_org_id_created_at ON leads(org_id, created_at);

-- Tickets table index
CREATE INDEX IF NOT EXISTS idx_tickets_org_id_created_at ON tickets(org_id, created_at);

-- Appointments table index
CREATE INDEX IF NOT EXISTS idx_appointments_org_id_created_at ON appointments(org_id, created_at);

-- Agents table index (optional, for name lookups)
CREATE INDEX IF NOT EXISTS idx_agents_org_id_name ON agents(org_id, name) WHERE name IS NOT NULL;

