-- Add configuration fields to agents table
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS behavior_preset TEXT NULL,
ADD COLUMN IF NOT EXISTS agent_type TEXT NULL,
ADD COLUMN IF NOT EXISTS first_message TEXT NULL,
ADD COLUMN IF NOT EXISTS emphasis_points JSONB NULL,
ADD COLUMN IF NOT EXISTS system_prompt_override TEXT NULL,
ADD COLUMN IF NOT EXISTS effective_system_prompt TEXT NULL,
ADD COLUMN IF NOT EXISTS vapi_sync_status TEXT NULL,
ADD COLUMN IF NOT EXISTS vapi_synced_at TIMESTAMPTZ NULL;

-- Add comment for documentation
COMMENT ON COLUMN agents.behavior_preset IS 'Behavior preset identifier (e.g., professional, support, concierge)';
COMMENT ON COLUMN agents.agent_type IS 'Agent type classification';
COMMENT ON COLUMN agents.first_message IS 'First message/greeting shown at call start';
COMMENT ON COLUMN agents.emphasis_points IS 'JSON array of emphasis points for the agent';
COMMENT ON COLUMN agents.system_prompt_override IS 'Manual system prompt override (Advanced settings)';
COMMENT ON COLUMN agents.effective_system_prompt IS 'Derived system prompt (computed from preset + overrides)';
COMMENT ON COLUMN agents.vapi_sync_status IS 'Last Vapi sync status (success, error, pending)';
COMMENT ON COLUMN agents.vapi_synced_at IS 'Timestamp of last successful Vapi sync';

