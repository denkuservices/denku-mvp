-- Migration: Make audit_log.actor_user_id nullable
-- Purpose: Support system actions (webhooks, automated processes) that don't have a user actor

-- Drop NOT NULL constraint on actor_user_id
ALTER TABLE audit_log
ALTER COLUMN actor_user_id DROP NOT NULL;

