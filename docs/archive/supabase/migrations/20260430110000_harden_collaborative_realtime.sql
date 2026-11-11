/*
  # Harden collaborative realtime coverage

  1. Performance
    - Add indexes for high-traffic collaborative filters.
    - Support party-scoped message, inventory, and atlas lookups.

  2. Realtime
    - Add all collaborative tables used by active client subscriptions to `supabase_realtime`.
    - Keep the migration idempotent so it can be applied safely in existing environments.
*/

CREATE INDEX IF NOT EXISTS idx_messages_party_id_created_at
ON public.messages(party_id, created_at);

CREATE INDEX IF NOT EXISTS idx_party_inventory_party_id
ON public.party_inventory(party_id);

CREATE INDEX IF NOT EXISTS idx_party_inventory_log_party_id_timestamp
ON public.party_inventory_log(party_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_party_members_party_id
ON public.party_members(party_id);

CREATE INDEX IF NOT EXISTS idx_party_map_pins_map_id
ON public.party_map_pins(map_id);

CREATE INDEX IF NOT EXISTS idx_party_map_drawings_map_id
ON public.party_map_drawings(map_id);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_inventory;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_inventory_log;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_members;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_map_pins;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.party_map_drawings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.encounters;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.encounter_combatants;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
