-- Enable RLS on agents table (if not already enabled)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Drop existing SELECT policy if it exists (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view agents in their organization" ON agents;

-- Create SELECT policy: allow users to view agents where their profile.org_id matches agents.org_id
CREATE POLICY "Users can view agents in their organization"
ON agents
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.org_id = agents.org_id
  )
);

