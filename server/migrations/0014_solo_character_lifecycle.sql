ALTER TABLE solo_campaign_states
  DROP CONSTRAINT solo_campaign_states_player_character_id_fkey,
  ADD CONSTRAINT solo_campaign_states_player_character_id_fkey
    FOREIGN KEY (player_character_id) REFERENCES characters(id) ON DELETE CASCADE;
