ALTER TABLE campaign_events
  DROP CONSTRAINT campaign_events_visibility_check,
  ADD CONSTRAINT campaign_events_visibility_check
    CHECK (visibility IN ('public', 'players', 'gm', 'system', 'assigned'));

CREATE TABLE roll_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL,
  encounter_id uuid REFERENCES encounters(id) ON DELETE SET NULL,
  actor_id uuid,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 200),
  expression text NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 100),
  roll_kind text NOT NULL DEFAULT 'generic'
    CHECK (roll_kind IN ('generic', 'check', 'damage', 'recovery', 'advancement')),
  target_value integer CHECK (target_value IS NULL OR target_value BETWEEN 1 AND 20),
  modifier text NOT NULL DEFAULT 'normal'
    CHECK (modifier IN ('normal', 'boon', 'bane')),
  mode text NOT NULL CHECK (mode IN ('player', 'server', 'mixed')),
  visibility text NOT NULL DEFAULT 'assigned'
    CHECK (visibility IN ('gm', 'players', 'assigned')),
  context text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  campaign_revision bigint NOT NULL CHECK (campaign_revision >= 0),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX roll_requests_campaign_created_idx
  ON roll_requests(campaign_id, created_at DESC);
CREATE INDEX roll_requests_assigned_pending_idx
  ON roll_requests(assigned_user_id, created_at DESC);

CREATE TABLE roll_request_results (
  request_id uuid PRIMARY KEY REFERENCES roll_requests(id) ON DELETE RESTRICT,
  roll_id uuid NOT NULL UNIQUE REFERENCES recorded_rolls(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_source text NOT NULL CHECK (resolution_source IN ('server', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_trusted_roll_record_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER roll_requests_prevent_update
  BEFORE UPDATE ON roll_requests
  FOR EACH ROW EXECUTE FUNCTION prevent_trusted_roll_record_update();

CREATE TRIGGER roll_request_results_prevent_update
  BEFORE UPDATE ON roll_request_results
  FOR EACH ROW EXECUTE FUNCTION prevent_trusted_roll_record_update();
