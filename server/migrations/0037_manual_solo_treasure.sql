CREATE TABLE solo_treasure_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES solo_missions(id) ON DELETE SET NULL,
  waypoint_id uuid REFERENCES solo_waypoints(id) ON DELETE SET NULL,
  source_roll_id uuid REFERENCES recorded_rolls(id) ON DELETE SET NULL,
  card_count smallint NOT NULL CHECK (card_count BETWEEN 1 AND 20),
  cards jsonb NOT NULL CHECK (
    jsonb_typeof(cards) = 'array'
    AND jsonb_array_length(cards) = card_count
  ),
  shuffled_before_draw boolean NOT NULL CHECK (shuffled_before_draw),
  returned_and_shuffled boolean NOT NULL CHECK (returned_and_shuffled),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  campaign_revision bigint NOT NULL CHECK (campaign_revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX solo_treasure_draws_campaign_created_idx
  ON solo_treasure_draws(campaign_id, created_at DESC);

CREATE UNIQUE INDEX solo_treasure_draws_source_roll_idx
  ON solo_treasure_draws(source_roll_id)
  WHERE source_roll_id IS NOT NULL;
