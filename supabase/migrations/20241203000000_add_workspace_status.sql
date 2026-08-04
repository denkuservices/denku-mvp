-- Migration: Add workspace_status and paused_at to organization_settings
-- Purpose: Enable pause/resume functionality for workspace maintenance mode

-- Add workspace_status column (default 'active')
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS workspace_status TEXT DEFAULT 'active' NOT NULL;

-- Add paused_at timestamp
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;

-- Add constraint to ensure valid status values
-- R-031: guarded so this migration is a no-op when replayed after the
-- 20241101000000 baseline (which already carries this constraint). PostgreSQL has
-- no ADD CONSTRAINT IF NOT EXISTS. Identical definition, so drop-and-recreate is safe.
ALTER TABLE organization_settings
DROP CONSTRAINT IF EXISTS check_workspace_status;
ALTER TABLE organization_settings
ADD CONSTRAINT check_workspace_status
CHECK (workspace_status IN ('active', 'paused'));

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_organization_settings_workspace_status 
ON organization_settings(workspace_status) 
WHERE workspace_status = 'paused';

