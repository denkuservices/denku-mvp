-- Migration: Add call_id columns to appointments and tickets tables
-- Purpose: Enable exact linking between calls and appointments/tickets for outcome resolution
-- Note: call_id is nullable to support existing records and fallback linking logic

-- Add call_id to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_appointments_call_id ON appointments(call_id) WHERE call_id IS NOT NULL;

-- Add call_id to tickets table
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tickets_call_id ON tickets(call_id) WHERE call_id IS NOT NULL;

