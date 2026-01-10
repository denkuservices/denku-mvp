-- Deduplicate profiles by auth_user_id and email, then add unique indexes
-- This migration is idempotent and safe to run multiple times

-- Step 1: Deduplicate by auth_user_id (keep most recent)
-- Delete duplicate profiles, keeping the one with the latest updated_at (or created_at if updated_at is null)
WITH ranked_profiles AS (
  SELECT 
    id,
    auth_user_id,
    ROW_NUMBER() OVER (
      PARTITION BY auth_user_id 
      ORDER BY 
        COALESCE(updated_at, created_at) DESC,
        created_at DESC
    ) as rn
  FROM public.profiles
  WHERE auth_user_id IS NOT NULL
)
DELETE FROM public.profiles
WHERE id IN (
  SELECT id FROM ranked_profiles WHERE rn > 1
);

-- Step 2: Deduplicate by email (keep most recent)
-- Only deduplicate where auth_user_id is NULL or email doesn't match auth_user_id
WITH ranked_profiles AS (
  SELECT 
    id,
    LOWER(email) as lower_email,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(email) 
      ORDER BY 
        COALESCE(updated_at, created_at) DESC,
        created_at DESC
    ) as rn
  FROM public.profiles
  WHERE email IS NOT NULL
    AND (auth_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM auth.users u WHERE u.id = profiles.auth_user_id AND LOWER(u.email) = LOWER(profiles.email)
    ))
)
DELETE FROM public.profiles
WHERE id IN (
  SELECT id FROM ranked_profiles WHERE rn > 1
);

-- Step 3: Create unique index on auth_user_id (where not null)
-- This prevents future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_unique
ON public.profiles (auth_user_id)
WHERE auth_user_id IS NOT NULL;

-- Step 4: Ensure unique index on lower(email) (where not null)
-- This was already created in a previous migration, but ensure it exists
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique
ON public.profiles (LOWER(email))
WHERE email IS NOT NULL;

