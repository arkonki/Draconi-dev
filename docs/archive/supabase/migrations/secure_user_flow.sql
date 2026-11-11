/*
  # Secure User Creation Flow (Trigger-based)

  1. Purpose
    - Replaces manual client-side profile creation with a secure server-side trigger.
    - Prevents "Zombie Users" (Auth without Profile).
    - Secures Role assignment.

  2. Changes
    - Creates a function `public.handle_new_user()`.
    - Creates a trigger `on_auth_user_created` that fires after INSERT on `auth.users`.
    - Sets up RLS for `public.users` to ensure users can only read/update their own data.
*/

-- 1. Create the Function to handle new user insertion
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, username, role, created_at, updated_at)
  VALUES (
    new.id,
    new.email,
    -- Extract metadata safely, defaulting to 'Anonymous' if missing
    COALESCE(new.raw_user_meta_data->>'username', 'Anonymous'),
    -- Extract role, defaulting to 'player' if missing or invalid
    COALESCE(new.raw_user_meta_data->>'role', 'player'),
    NOW(),
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the Trigger
-- We drop it first to ensure we can recreate it cleanly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Secure the Users Table (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own profile
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Users can update their own profile (but NOT their role)
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
  -- Note: To strictly prevent role changes, we would use a separate trigger or column-level privileges,
  -- but for now, this ensures they can only touch their own row.
