-- Migration: Add auth_user_id column to link profiles to Supabase auth users
-- Purpose: Fix profile updates by correctly linking to authenticated user
-- Idempotent: Safe to run multiple times

-- Step 1: Add auth_user_id column (idempotent)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Step 2: Backfill auth_user_id for existing rows by matching email
UPDATE public.profiles p
SET auth_user_id = u.id
FROM auth.users u
WHERE p.auth_user_id IS NULL
  AND p.email IS NOT NULL
  AND LOWER(p.email) = LOWER(u.email);

-- Step 3: Add unique index on auth_user_id (where not null)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_unique 
ON public.profiles (auth_user_id) 
WHERE auth_user_id IS NOT NULL;

-- Step 3b: Add unique index on email (lowercase, where not null) for safe claim-by-email
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique 
ON public.profiles (LOWER(email)) 
WHERE email IS NOT NULL;

-- Step 4: Update RLS UPDATE policy to use auth_user_id
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- Step 5: Update RLS SELECT policy to use auth_user_id (if exists, otherwise create)
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  USING (auth.uid() = auth_user_id);
