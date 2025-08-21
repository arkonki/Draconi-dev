-- Helper function to check if a user is a member of a party or its creator
CREATE OR REPLACE FUNCTION is_party_member_or_creator(p_party_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_member BOOLEAN;
  is_creator BOOLEAN;
BEGIN
  -- Check if the user is a member of the party through any of their characters
  SELECT EXISTS (
    SELECT 1
    FROM public.party_members pm
    JOIN public.characters c ON pm.character_id = c.id
    WHERE pm.party_id = p_party_id AND c.user_id = p_user_id
  ) INTO is_member;

  -- Check if the user is the creator of the party
  SELECT EXISTS (
    SELECT 1
    FROM public.parties
    WHERE id = p_party_id AND created_by = p_user_id
  ) INTO is_creator;

  RETURN is_member OR is_creator;
END;
$$;

-- Create party_tasks table
CREATE TABLE public.party_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- e.g., 'open', 'completed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT check_status_values CHECK (status IN ('open', 'completed'))
);

-- Add comments to the table and columns
COMMENT ON TABLE public.party_tasks IS 'Stores tasks associated with adventure parties.';
COMMENT ON COLUMN public.party_tasks.id IS 'Unique identifier for the task.';
COMMENT ON COLUMN public.party_tasks.party_id IS 'Foreign key referencing the party this task belongs to.';
COMMENT ON COLUMN public.party_tasks.created_by_user_id IS 'Foreign key referencing the user who created the task.';
COMMENT ON COLUMN public.party_tasks.title IS 'The title or name of the task.';
COMMENT ON COLUMN public.party_tasks.description IS 'A more detailed description of the task.';
COMMENT ON COLUMN public.party_tasks.status IS 'The current status of the task (e.g., open, completed).';
COMMENT ON COLUMN public.party_tasks.created_at IS 'Timestamp of when the task was created.';
COMMENT ON COLUMN public.party_tasks.updated_at IS 'Timestamp of when the task was last updated.';
COMMENT ON COLUMN public.party_tasks.completed_at IS 'Timestamp of when the task was marked as completed.';

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on party_tasks update
CREATE TRIGGER set_party_tasks_updated_at
BEFORE UPDATE ON public.party_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trigger_set_timestamp();

-- Enable Row Level Security for party_tasks
ALTER TABLE public.party_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for party_tasks

-- Policy: Allow read access to party members and creators
CREATE POLICY "Allow read access to party members and creators"
ON public.party_tasks
FOR SELECT
USING (is_party_member_or_creator(party_id, auth.uid()));

-- Policy: Allow insert access to party members and creators
CREATE POLICY "Allow insert access to party members and creators"
ON public.party_tasks
FOR INSERT
WITH CHECK (
  is_party_member_or_creator(party_id, auth.uid()) AND
  created_by_user_id = auth.uid() -- Ensure creator is correctly set
);

-- Policy: Allow update access to task creator or party DM
CREATE POLICY "Allow update access to task creator or party DM"
ON public.party_tasks
FOR UPDATE
USING (
  (created_by_user_id = auth.uid()) OR
  EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.id = party_tasks.party_id AND p.created_by = auth.uid()
  )
)
WITH CHECK ( -- Redundant with USING here, but good practice for complex checks
  (created_by_user_id = auth.uid()) OR
  EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.id = party_tasks.party_id AND p.created_by = auth.uid()
  )
);

-- Policy: Allow delete access to task creator or party DM
CREATE POLICY "Allow delete access to task creator or party DM"
ON public.party_tasks
FOR DELETE
USING (
  (created_by_user_id = auth.uid()) OR
  EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.id = party_tasks.party_id AND p.created_by = auth.uid()
  )
);

-- Grant usage on schema public to anon and authenticated roles if not already granted
-- This might be needed if these roles don't have default usage.
-- GRANT USAGE ON SCHEMA public TO anon;
-- GRANT USAGE ON SCHEMA public TO authenticated;

-- Grant necessary permissions on the table to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_tasks TO authenticated;

-- Grant execute on helper function to authenticated role
GRANT EXECUTE ON FUNCTION public.is_party_member_or_creator(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_set_timestamp() TO authenticated;
