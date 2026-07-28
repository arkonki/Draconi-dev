ALTER TABLE parties
  ADD COLUMN helper_status text NOT NULL DEFAULT 'active'
    CHECK (helper_status IN ('active', 'paused', 'completed', 'archived')),
  ADD COLUMN rules_version text NOT NULL DEFAULT 'dragonbane-core',
  ADD COLUMN helper_revision bigint NOT NULL DEFAULT 0 CHECK (helper_revision >= 0),
  ADD COLUMN current_scene jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN game_time jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN gm_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN open_threads jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE encounters
  ADD COLUMN helper_revision bigint NOT NULL DEFAULT 0 CHECK (helper_revision >= 0);

CREATE TABLE game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'active', 'completed')),
  summary text,
  gm_notes text,
  started_at timestamptz,
  ended_at timestamptz,
  starting_revision bigint,
  ending_revision bigint,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_sessions_campaign_id_idx
  ON game_sessions(campaign_id, created_at DESC);
CREATE UNIQUE INDEX game_sessions_one_active_per_campaign
  ON game_sessions(campaign_id) WHERE status = 'active';
CREATE TRIGGER game_sessions_set_updated_at
  BEFORE UPDATE ON game_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE parties
  ADD COLUMN active_session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL;

CREATE TABLE campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 100),
  actor_id uuid,
  target_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'gm'
    CHECK (visibility IN ('public', 'players', 'gm', 'system')),
  source_type text NOT NULL DEFAULT 'system'
    CHECK (source_type IN ('user', 'chatgpt', 'system')),
  source_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source_client text,
  source_conversation_id text,
  idempotency_key text,
  previous_revision bigint NOT NULL CHECK (previous_revision >= 0),
  resulting_revision bigint NOT NULL CHECK (resulting_revision >= previous_revision),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, sequence)
);
CREATE INDEX campaign_events_campaign_sequence_idx
  ON campaign_events(campaign_id, sequence DESC);
CREATE INDEX campaign_events_actor_idx
  ON campaign_events(campaign_id, actor_id, sequence DESC);
CREATE INDEX campaign_events_session_idx
  ON campaign_events(session_id, sequence DESC);

CREATE TABLE helper_idempotency_keys (
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  operation text NOT NULL CHECK (char_length(operation) BETWEEN 1 AND 100),
  request_hash text NOT NULL CHECK (char_length(request_hash) = 64),
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id, idempotency_key)
);
CREATE INDEX helper_idempotency_created_at_idx
  ON helper_idempotency_keys(created_at);

CREATE OR REPLACE FUNCTION prevent_campaign_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'campaign_events is append-only';
END;
$$;

CREATE TRIGGER campaign_events_prevent_update
  BEFORE UPDATE OR DELETE ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_event_mutation();

CREATE OR REPLACE FUNCTION touch_helper_campaign_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed_campaign_id uuid;
  changed_encounter_id uuid;
  new_json jsonb;
  old_json jsonb;
BEGIN
  IF current_setting('draconi.skip_campaign_revision', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  new_json := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  old_json := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;

  IF TG_TABLE_NAME = 'characters' THEN
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  ELSIF TG_TABLE_NAME = 'encounters' THEN
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  ELSIF TG_TABLE_NAME = 'encounter_combatants' THEN
    changed_encounter_id := COALESCE(
      (new_json->>'encounter_id')::uuid,
      (old_json->>'encounter_id')::uuid
    );
    SELECT party_id INTO changed_campaign_id
    FROM encounters
    WHERE id = changed_encounter_id;
  ELSE
    changed_campaign_id := COALESCE(
      (new_json->>'party_id')::uuid,
      (old_json->>'party_id')::uuid
    );
  END IF;

  IF changed_campaign_id IS NOT NULL THEN
    UPDATE parties
    SET helper_revision = helper_revision + 1
    WHERE id = changed_campaign_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  table_to_watch text;
BEGIN
  FOREACH table_to_watch IN ARRAY ARRAY[
    'characters',
    'encounters',
    'encounter_combatants',
    'party_inventory',
    'party_members',
    'party_tasks',
    'time_trackers',
    'notes',
    'random_tables',
    'story_ideas',
    'compendium'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_helper_revision AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION touch_helper_campaign_revision()',
      table_to_watch,
      table_to_watch
    );
  END LOOP;
END
$$;
