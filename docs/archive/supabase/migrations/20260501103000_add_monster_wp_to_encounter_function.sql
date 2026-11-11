/*
  # Allow monster WP to sync into encounters

  NPC-style monsters can now store WP inside the existing `stats` JSON object.
  This updates the encounter insertion RPC so those values populate `current_wp`
  and `max_wp` when a monster is added to combat.
*/

CREATE OR REPLACE FUNCTION public.add_monster_to_encounter(
  p_encounter_id UUID,
  p_monster_id UUID,
  p_custom_name TEXT,
  p_initiative_roll INTEGER DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_monster record;
  v_new_combatant_id UUID;
BEGIN
  SELECT * INTO v_monster FROM public.monsters WHERE id = p_monster_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Monster not found';
  END IF;

  INSERT INTO public.encounter_combatants (
    encounter_id,
    monster_id,
    is_player_character,
    display_name,
    current_hp,
    max_hp,
    current_wp,
    max_wp,
    initiative_roll
  ) VALUES (
    p_encounter_id,
    p_monster_id,
    FALSE,
    p_custom_name,
    COALESCE((v_monster.stats->>'HP')::INT, 0),
    COALESCE((v_monster.stats->>'HP')::INT, 0),
    NULLIF(v_monster.stats->>'WP', '')::INT,
    NULLIF(v_monster.stats->>'WP', '')::INT,
    p_initiative_roll
  )
  RETURNING id INTO v_new_combatant_id;

  RETURN jsonb_build_object('id', v_new_combatant_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
