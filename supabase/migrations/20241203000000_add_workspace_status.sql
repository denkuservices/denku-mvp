-- Migration: Add workspace_status and paused_at to organization_settings
-- Purpose: Enable pause/resume functionality for workspace maintenance mode

-- Add workspace_status column (default 'active')
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS workspace_status TEXT DEFAULT 'active' NOT NULL;

-- Add paused_at timestamp
ALTER TABLE organization_settings
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ NULL;

-- Add constraint to ensure valid status values
ALTER TABLE organization_settings
ADD CONSTRAINT check_workspace_status 
CHECK (workspace_status IN ('active', 'paused'));

-- Add index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_organization_settings_workspace_status 
ON organization_settings(workspace_status) 
WHERE workspace_status = 'paused';

