/*
  # Create Encounter Tables

  This migration sets up the database schema for managing encounters within parties.

  1. New Tables
    - `encounters`
      - `id` (uuid, primary key): Unique identifier for the encounter.
      - `party_id` (uuid, foreign key): Links to the `parties` table.
      - `name` (text): Name of the encounter (e.g., "Goblin Ambush").
      - `description` (text, nullable): Optional description of the encounter.
      - `status` (text, default 'planning'): Current status (e.g., 'planning', 'active', 'completed').
      - `current_round` (integer, default 0): Current combat round.
      - `active_combatant_id` (uuid, nullable, foreign key): Links to `encounter_combatants`, indicating whose turn it is.
      - `created_at` (timestamptz, default now()): Timestamp of creation.
      - `updated_at` (timestamptz, default now()): Timestamp of last update.
    - `encounter_combatants`
      - `id` (uuid, primary key): Unique identifier for the combatant instance in an encounter.
      - `encounter_id` (uuid, foreign key): Links to the `encounters` table.
      - `character_id` (uuid, nullable, foreign key): Links to `characters` table (for player characters or NPCs).
      - `monster_id` (uuid, nullable, foreign key): Links to `monsters` table (for predefined monsters).
      - `monster_instance_id` (uuid, default gen_random_uuid()): Unique ID for this specific instance of a monster in this encounter, especially if `monster_id` is used for multiple same-type monsters.
      - `display_name` (text): Name to display for the combatant (can be character name or monster name).
      - `current_hp` (integer, default 0): Current hit points.
      - `max_hp` (integer, default 0): Maximum hit points.
      - `current_wp` (integer, nullable): Current willpower points.
      - `max_wp` (integer, nullable): Maximum willpower points.
      - `status_effects` (jsonb, default '[]'): Array of status effects (e.g., { name: "Poisoned", duration: 3 }).
      - `initiative_roll` (integer, nullable): Rolled initiative value.
      - `initiative_order` (integer, nullable): Calculated order in combat.
      - `is_active_turn` (boolean, default false): True if it's this combatant's turn.
      - `created_at` (timestamptz, default now()): Timestamp of creation.
      - `updated_at` (timestamptz, default now()): Timestamp of last update.

  2. Foreign Keys
    - `encounters.party_id` references `parties.id` (on delete cascade).
    - `encounters.active_combatant_id` references `encounter_combatants.id` (on delete set null).
    - `encounter_combatants.encounter_id` references `encounters.id` (on delete cascade).
    - `encounter_combatants.character_id` references `characters.id` (on delete set null).
    - `encounter_combatants.monster_id` references `monsters.id` (on delete set null).

  3. Indexes
    - Indexes on foreign key columns for performance.
    - Index on `encounter_combatants.encounter_id` and `encounter_combatants.initiative_order`.

  4. Triggers
    - `handle_updated_at` trigger for both tables to automatically update `updated_at` column.

  5. Security
    - Enable RLS for `encounters` and `encounter_combatants`.
    - Policies:
      - DMs can manage (CRUD) encounters and combatants for parties they own.
      - Authenticated users (party members) can read encounter and combatant data for encounters their party is involved in.
      - (Further refinement of player read access will be needed, e.g. only active encounters).
*/

-- Helper function to update `updated_at` column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Encounters Table
CREATE TABLE IF NOT EXISTS public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planning', -- 'planning', 'active', 'completed'
  current_round INTEGER NOT NULL DEFAULT 0,
  active_combatant_id uuid, -- FK added after encounter_combatants table is created
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encounters_party_id ON public.encounters(party_id);

CREATE TRIGGER on_encounters_updated
  BEFORE UPDATE ON public.encounters
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Encounter Combatants Table
CREATE TABLE IF NOT EXISTS public.encounter_combatants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  character_id uuid REFERENCES public.characters(id) ON DELETE SET NULL,
  monster_id uuid REFERENCES public.monsters(id) ON DELETE SET NULL,
  monster_instance_id uuid NOT NULL DEFAULT gen_random_uuid(), -- For tracking individual monsters of the same type
  display_name TEXT NOT NULL,
  current_hp INTEGER NOT NULL DEFAULT 0,
  max_hp INTEGER NOT NULL DEFAULT 0,
  current_wp INTEGER,
  max_wp INTEGER,
  status_effects JSONB DEFAULT '[]'::jsonb,
  initiative_roll INTEGER,
  initiative_order INTEGER,
  is_active_turn BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT character_or_monster_id_check CHECK (character_id IS NOT NULL OR monster_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_encounter_combatants_encounter_id ON public.encounter_combatants(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_character_id ON public.encounter_combatants(character_id);
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_monster_id ON public.encounter_combatants(monster_id);
CREATE INDEX IF NOT EXISTS idx_encounter_combatants_initiative ON public.encounter_combatants(encounter_id, initiative_order);

CREATE TRIGGER on_encounter_combatants_updated
  BEFORE UPDATE ON public.encounter_combatants
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

-- Add foreign key constraint for active_combatant_id in encounters table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'fk_encounters_active_combatant' AND conrelid = 'public.encounters'::regclass
  ) THEN
    ALTER TABLE public.encounters
    ADD CONSTRAINT fk_encounters_active_combatant
    FOREIGN KEY (active_combatant_id) REFERENCES public.encounter_combatants(id) ON DELETE SET NULL;
  END IF;
END $$;

-- RLS for Encounters Table
ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DMs can manage encounters for their parties"
  ON public.encounters
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id = encounters.party_id AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.parties p
      WHERE p.id = encounters.party_id AND p.created_by = auth.uid()
    )
  );

CREATE POLICY "Party members can view encounters they are part of"
  ON public.encounters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.party_members pm
      JOIN public.parties p ON pm.party_id = p.id
      WHERE p.id = encounters.party_id AND pm.user_id = auth.uid()
    )
    OR
    EXISTS ( -- DM can also view
      SELECT 1 FROM public.parties p
      WHERE p.id = encounters.party_id AND p.created_by = auth.uid()
    )
  );


-- RLS for Encounter Combatants Table
ALTER TABLE public.encounter_combatants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DMs can manage combatants in their parties' encounters"
  ON public.encounter_combatants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.encounters e
      JOIN public.parties p ON e.party_id = p.id
      WHERE e.id = encounter_combatants.encounter_id AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.encounters e
      JOIN public.parties p ON e.party_id = p.id
      WHERE e.id = encounter_combatants.encounter_id AND p.created_by = auth.uid()
    )
  );

CREATE POLICY "Party members can view combatants in their encounters"
  ON public.encounter_combatants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.encounters e
      JOIN public.party_members pm ON e.party_id = pm.party_id
      WHERE e.id = encounter_combatants.encounter_id AND pm.user_id = auth.uid()
    )
    OR
    EXISTS ( -- DM can also view
       SELECT 1 FROM public.encounters e
       JOIN public.parties p ON e.party_id = p.id
       WHERE e.id = encounter_combatants.encounter_id AND p.created_by = auth.uid()
    )
  );
