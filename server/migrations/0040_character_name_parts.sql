ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS given_name text,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS family_name text;

UPDATE characters
SET given_name = name
WHERE given_name IS NULL;
