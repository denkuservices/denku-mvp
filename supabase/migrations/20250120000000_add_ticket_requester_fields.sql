-- Add requester/contact info fields to tickets table
-- These fields allow capturing basic contact info directly on tickets
-- when there is no linked lead

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS requester_phone text,
  ADD COLUMN IF NOT EXISTS requester_email text,
  ADD COLUMN IF NOT EXISTS requester_address text;

-- No additional indexes needed - org_id index already covers filtering
-- These fields are typically queried with org_id + ticket_id (already indexed)

