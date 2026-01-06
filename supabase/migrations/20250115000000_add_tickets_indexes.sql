-- Add indexes for tickets table to optimize queries
-- These indexes support filtering, sorting, and joining operations

-- Index for org_id + created_at (default sorting)
CREATE INDEX IF NOT EXISTS idx_tickets_org_created ON tickets(org_id, created_at DESC);

-- Index for org_id + status + created_at (status filtering with sorting)
CREATE INDEX IF NOT EXISTS idx_tickets_org_status_created ON tickets(org_id, status, created_at DESC);

-- Index for org_id + priority + created_at (priority filtering with sorting)
CREATE INDEX IF NOT EXISTS idx_tickets_org_priority_created ON tickets(org_id, priority, created_at DESC);

-- Index for org_id + lead_id (joining with leads)
CREATE INDEX IF NOT EXISTS idx_tickets_org_lead ON tickets(org_id, lead_id) WHERE lead_id IS NOT NULL;

-- Index for org_id + call_id (joining with calls)
CREATE INDEX IF NOT EXISTS idx_tickets_org_call ON tickets(org_id, call_id) WHERE call_id IS NOT NULL;

-- Index for org_id + updated_at (alternative sorting)
CREATE INDEX IF NOT EXISTS idx_tickets_org_updated ON tickets(org_id, updated_at DESC);

