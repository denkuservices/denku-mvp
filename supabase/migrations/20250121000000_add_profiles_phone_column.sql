-- Migration: Add phone column to profiles table
-- Purpose: Enable users to store their phone number in their profile

-- Add phone column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text;

-- Ensure id is unique (required for .single() queries)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_id_unique ON public.profiles (id);

-- Ensure RLS policy allows users to update their own profile
-- Drop existing policy if it exists, then create fresh one
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

