/*
        # Create monsters table and related objects

        This migration sets up the `monsters` table for storing bestiary entries.

        1.  New Table: `monsters`
            *   `id`: UUID, Primary Key, auto-generated.
            *   `created_by`: UUID, Foreign Key to `auth.users(id)`. Stores who created the monster.
            *   `name`: TEXT, Not Null. Name of the monster.
            *   `description`: TEXT. Detailed description of the monster.
            *   `category`: TEXT. Category of the monster (e.g., "Beast", "Undead").
            *   `stats`: JSONB, Not Null. Stores monster statistics like Ferocity, Size, Movement, Armor, HP.
                *   `FEROCITY`: number
                *   `SIZE`: "Small" | "Normal" | "Large" | "Huge" | "Swarm"
                *   `MOVEMENT`: number
                *   `ARMOR`: number
                *   `HP`: number
            *   `attacks`: JSONB, Not Null. Stores a D6 rollable table of attacks.
                *   Each entry in the table can have:
                    *   `roll_values`: string (e.g., "1", "2-3")
                    *   `name`: string (attack name)
                    *   `description`: string (attack description)
                    *   `effects`: Optional array of effect entries.
                        *   Each effect entry can have:
                            *   `roll_values`: string (optional, for D6 rollable effects)
                            *   `name`: string (effect name)
                            *   `description`: string (effect description)
            *   `created_at`: TIMESTAMPTZ, Default `now()`.
            *   `updated_at`: TIMESTAMPTZ, Default `now()`.

        2.  Triggers
            *   A trigger `set_monsters_updated_at` is created to automatically update the `updated_at` timestamp on any row update in the `monsters` table. It uses the existing `public.trigger_set_timestamp()` function.

        3.  Row Level Security (RLS)
            *   RLS is enabled on the `monsters` table.
            *   **SELECT Policy**: Authenticated users can read all monster entries.
            *   **INSERT Policy**: Authenticated users can insert new monsters, with `created_by` automatically set to their user ID.
            *   **UPDATE Policy**: Users can only update monsters they created.
            *   **DELETE Policy**: Users can only delete monsters they created.

        4.  Permissions
            *   The `authenticated` role is granted SELECT, INSERT, UPDATE, DELETE permissions on the `monsters` table.
      */

      -- Create monsters table
      CREATE TABLE IF NOT EXISTS public.monsters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT,
        stats JSONB NOT NULL DEFAULT '{}'::jsonb,
        attacks JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Add comments to the table and columns
      COMMENT ON TABLE public.monsters IS 'Stores bestiary entries for monsters and creatures.';
      COMMENT ON COLUMN public.monsters.id IS 'Unique identifier for the monster entry.';
      COMMENT ON COLUMN public.monsters.created_by IS 'Foreign key referencing the user who created the monster entry.';
      COMMENT ON COLUMN public.monsters.name IS 'Name of the monster.';
      COMMENT ON COLUMN public.monsters.description IS 'Detailed description of the monster, its lore, behavior, etc.';
      COMMENT ON COLUMN public.monsters.category IS 'Category of the monster (e.g., Beast, Undead, Humanoid, Construct).';
      COMMENT ON COLUMN public.monsters.stats IS 'JSONB object containing core statistics for the monster (FEROCITY, SIZE, MOVEMENT, ARMOR, HP).';
      COMMENT ON COLUMN public.monsters.attacks IS 'JSONB array representing a D6 rollable table of attacks, where each attack can have its own D6 rollable effects.';
      COMMENT ON COLUMN public.monsters.created_at IS 'Timestamp of when the monster entry was created.';
      COMMENT ON COLUMN public.monsters.updated_at IS 'Timestamp of when the monster entry was last updated.';

      -- Ensure the trigger_set_timestamp function exists (it should from previous migrations)
      -- CREATE OR REPLACE FUNCTION public.trigger_set_timestamp() ... (if it might not exist)

      -- Trigger to update updated_at on monsters table update
      CREATE TRIGGER set_monsters_updated_at
      BEFORE UPDATE ON public.monsters
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_set_timestamp();

      -- Enable Row Level Security for monsters
      ALTER TABLE public.monsters ENABLE ROW LEVEL SECURITY;

      -- RLS Policies for monsters

      -- Policy: Allow authenticated users to read all monster entries.
      CREATE POLICY "Allow read access to authenticated users for monsters"
      ON public.monsters
      FOR SELECT
      TO authenticated
      USING (true);

      -- Policy: Allow authenticated users to insert new monsters.
      CREATE POLICY "Allow insert access to authenticated users for monsters"
      ON public.monsters
      FOR INSERT
      TO authenticated
      WITH CHECK (created_by = auth.uid());

      -- Policy: Allow users to update their own monster entries.
      CREATE POLICY "Allow update access to creators for their monsters"
      ON public.monsters
      FOR UPDATE
      TO authenticated
      USING (created_by = auth.uid())
      WITH CHECK (created_by = auth.uid());

      -- Policy: Allow users to delete their own monster entries.
      CREATE POLICY "Allow delete access to creators for their monsters"
      ON public.monsters
      FOR DELETE
      TO authenticated
      USING (created_by = auth.uid());

      -- Grant necessary permissions on the table to authenticated role
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.monsters TO authenticated;
