\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
SELECT pg_advisory_xact_lock(hashtext('draconi_supabase_import_20260723'));

DO $validation$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'supabase_import') THEN
    RAISE EXCEPTION 'supabase_import staging schema is missing';
  END IF;
  IF to_regclass('pg_temp.supabase_auth_credentials') IS NULL THEN
    RAISE EXCEPTION 'temporary Supabase credential mapping is missing';
  END IF;
  IF (SELECT count(*) FROM supabase_auth_credentials) <> 10 THEN
    RAISE EXCEPTION 'expected 10 Supabase credential mappings';
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_auth_credentials
    WHERE password_hash !~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'
  ) THEN
    RAISE EXCEPTION 'unsupported Supabase password hash';
  END IF;
  IF EXISTS (
    SELECT 1 FROM supabase_import.party_display_sessions
    WHERE expires_at::timestamptz >= now()
  ) THEN
    RAISE EXCEPTION 'active projector sessions require an explicit migration policy';
  END IF;
END
$validation$;

CREATE TEMP TABLE supabase_import_report (
  step text PRIMARY KEY,
  affected bigint NOT NULL
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.import_table(
  target_table text,
  source_relation regclass,
  overrides jsonb DEFAULT '{}'::jsonb,
  excluded text[] DEFAULT '{}'::text[],
  predicate text DEFAULT 'true',
  conflict_sql text DEFAULT ''
) RETURNS bigint
LANGUAGE plpgsql
AS $function$
DECLARE
  target_relation regclass;
  target_columns text;
  select_expressions text;
  statement text;
  affected bigint;
BEGIN
  IF target_table !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid target table: %', target_table;
  END IF;
  target_relation := to_regclass(format('public.%I', target_table));
  IF target_relation IS NULL THEN
    RAISE EXCEPTION 'target table does not exist: %', target_table;
  END IF;

  SELECT
    string_agg(format('%I', target_attribute.attname), ', ' ORDER BY target_attribute.attnum),
    string_agg(
      CASE
        WHEN target_attribute.attnotnull AND target_default.adbin IS NOT NULL
          THEN format(
            'COALESCE(%s, %s)',
            CASE
              WHEN overrides ? target_attribute.attname
                THEN overrides ->> target_attribute.attname
              ELSE format(
                's.%I::%s',
                target_attribute.attname,
                format_type(target_attribute.atttypid, target_attribute.atttypmod)
              )
            END,
            pg_get_expr(target_default.adbin, target_default.adrelid)
          )
        WHEN overrides ? target_attribute.attname
          THEN overrides ->> target_attribute.attname
        ELSE format(
          's.%I::%s',
          target_attribute.attname,
          format_type(target_attribute.atttypid, target_attribute.atttypmod)
        )
      END,
      ', ' ORDER BY target_attribute.attnum
    )
  INTO target_columns, select_expressions
  FROM pg_catalog.pg_attribute target_attribute
  LEFT JOIN pg_catalog.pg_attribute source_attribute
    ON source_attribute.attrelid = source_relation
   AND source_attribute.attname = target_attribute.attname
   AND source_attribute.attnum > 0
   AND NOT source_attribute.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef target_default
    ON target_default.adrelid = target_attribute.attrelid
   AND target_default.adnum = target_attribute.attnum
  WHERE target_attribute.attrelid = target_relation
    AND target_attribute.attnum > 0
    AND NOT target_attribute.attisdropped
    AND target_attribute.attgenerated = ''
    AND NOT target_attribute.attname = ANY(excluded)
    AND (source_attribute.attname IS NOT NULL OR overrides ? target_attribute.attname);

  IF target_columns IS NULL OR select_expressions IS NULL THEN
    RAISE EXCEPTION 'no importable columns for public.%', target_table;
  END IF;

  statement := format(
    'INSERT INTO public.%I (%s) SELECT %s FROM %s s WHERE %s %s',
    target_table,
    target_columns,
    select_expressions,
    source_relation,
    predicate,
    conflict_sql
  );
  EXECUTE statement;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END
$function$;

CREATE OR REPLACE FUNCTION pg_temp.localize_storage_url(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $function$
  SELECT replace(
    value,
    'https://tkenxulvmzhhkuhfvcpt.supabase.co/storage/v1/object/public/images/',
    'https://draconi.ee/api/storage/public/images/'
  )
$function$;

INSERT INTO supabase_import_report
SELECT 'users_from_profiles', pg_temp.import_table(
  'users',
  'supabase_import.users'::regclass,
  jsonb_build_object(
    'username', $expression$
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.users target_user
          WHERE lower(target_user.username) = lower(s.username)
            AND lower(target_user.email) <> lower(s.email)
        )
          THEN s.username || '-' || left(s.id, 8)
        ELSE s.username
      END
    $expression$,
    'role', $expression$
      CASE WHEN s.role IN ('admin', 'dm', 'player') THEN s.role ELSE 'player' END
    $expression$,
    'last_login_at', $expression$NULLIF(s.last_login, '')::timestamptz$expression$
  ),
  '{}'::text[],
  $predicate$
    NOT EXISTS (
      SELECT 1 FROM public.users target_user
      WHERE lower(target_user.email) = lower(s.email)
    )
  $predicate$,
  'ON CONFLICT DO NOTHING'
);

WITH auth_only AS (
  SELECT
    auth_user.*,
    COALESCE(NULLIF(auth_user.raw_user_meta_data, '')::jsonb, '{}'::jsonb) AS metadata
  FROM supabase_import.auth_users auth_user
  WHERE NOT EXISTS (
    SELECT 1 FROM supabase_import.users profile
    WHERE lower(profile.email) = lower(auth_user.email)
  )
    AND NOT EXISTS (
      SELECT 1 FROM public.users target_user
      WHERE lower(target_user.email) = lower(auth_user.email)
    )
), inserted AS (
  INSERT INTO public.users (
    id,
    email,
    username,
    role,
    is_active,
    is_email_verified,
    account_status,
    created_at,
    updated_at,
    last_login_at
  )
  SELECT
    auth_only.id::uuid,
    lower(auth_only.email),
    COALESCE(
      NULLIF(auth_only.metadata ->> 'username', ''),
      split_part(auth_only.email, '@', 1),
      'user'
    ) || '-' || left(auth_only.id, 8),
    CASE
      WHEN auth_only.metadata ->> 'role' IN ('admin', 'dm', 'player')
        THEN auth_only.metadata ->> 'role'
      ELSE 'player'
    END,
    auth_only.deleted_at IS NULL,
    auth_only.email_confirmed_at IS NOT NULL,
    CASE WHEN auth_only.deleted_at IS NULL THEN 'active' ELSE 'disabled' END,
    auth_only.created_at::timestamptz,
    auth_only.updated_at::timestamptz,
    auth_only.last_sign_in_at::timestamptz
  FROM auth_only
  ON CONFLICT DO NOTHING
  RETURNING 1
)
INSERT INTO supabase_import_report
SELECT 'users_from_auth_only', count(*) FROM inserted;

CREATE TEMP TABLE supabase_user_id_map (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO supabase_user_id_map (source_id, target_id)
SELECT source_user.id::uuid, target_user.id
FROM supabase_import.users source_user
JOIN public.users target_user ON lower(target_user.email) = lower(source_user.email);

CREATE TEMP TABLE supabase_auth_user_id_map (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO supabase_auth_user_id_map (source_id, target_id)
SELECT auth_user.id::uuid, target_user.id
FROM supabase_import.auth_users auth_user
JOIN public.users target_user ON lower(target_user.email) = lower(auth_user.email);

DO $user_mapping$
BEGIN
  IF (SELECT count(*) FROM supabase_user_id_map)
     <> (SELECT count(*) FROM supabase_import.users) THEN
    RAISE EXCEPTION 'not every public user profile mapped to a local user';
  END IF;
  IF (SELECT count(*) FROM supabase_auth_user_id_map)
     <> (SELECT count(*) FROM supabase_import.auth_users) THEN
    RAISE EXCEPTION 'not every Supabase auth account mapped to a local user';
  END IF;
END
$user_mapping$;

CREATE OR REPLACE FUNCTION pg_temp.mapped_user(source_id text)
RETURNS uuid
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
AS $function$
  SELECT user_map.target_id FROM supabase_user_id_map user_map WHERE user_map.source_id = $1::uuid
$function$;

WITH inserted AS (
  INSERT INTO public.app_credentials (user_id, password_hash, created_at, updated_at)
  SELECT
    user_map.target_id,
    credential.password_hash,
    COALESCE(auth_user.created_at::timestamptz, now()),
    COALESCE(auth_user.updated_at::timestamptz, now())
  FROM supabase_auth_credentials credential
  JOIN supabase_auth_user_id_map user_map ON user_map.source_id = credential.source_id
  JOIN supabase_import.auth_users auth_user ON auth_user.id::uuid = credential.source_id
  ON CONFLICT (user_id) DO NOTHING
  RETURNING 1
)
INSERT INTO supabase_import_report
SELECT 'bcrypt_credentials', count(*) FROM inserted;

INSERT INTO supabase_import_report
SELECT 'magic_schools', pg_temp.import_table(
  'magic_schools',
  'supabase_import.magic_schools'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.magic_schools target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

CREATE TEMP TABLE supabase_magic_school_id_map (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO supabase_magic_school_id_map (source_id, target_id)
SELECT source_school.id::uuid, target_school.id
FROM supabase_import.magic_schools source_school
JOIN public.magic_schools target_school ON lower(target_school.name) = lower(source_school.name);

DO $school_mapping$
BEGIN
  IF (SELECT count(*) FROM supabase_magic_school_id_map)
     <> (SELECT count(*) FROM supabase_import.magic_schools) THEN
    RAISE EXCEPTION 'not every magic school mapped to a local row';
  END IF;
END
$school_mapping$;

CREATE OR REPLACE FUNCTION pg_temp.mapped_school(source_id text)
RETURNS uuid
LANGUAGE sql
STABLE
RETURNS NULL ON NULL INPUT
AS $function$
  SELECT school_map.target_id FROM supabase_magic_school_id_map school_map WHERE school_map.source_id = $1::uuid
$function$;

INSERT INTO supabase_import_report
SELECT 'bio_data', pg_temp.import_table(
  'bio_data',
  'supabase_import.bio_data'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.bio_data target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'heroic_abilities', pg_temp.import_table(
  'heroic_abilities',
  'supabase_import.heroic_abilities'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.heroic_abilities target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'kin', pg_temp.import_table(
  'kin',
  'supabase_import.kin'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.kin target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'game_skills', pg_temp.import_table(
  'game_skills',
  'supabase_import.game_skills'::regclass,
  jsonb_build_object(
    'base_attribute', $expression$s.attribute$expression$,
    'category', $expression$CASE WHEN s.is_magic = 'true' THEN 'Magic' ELSE NULL END$expression$
  ),
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.game_skills target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

CREATE TEMP TABLE supabase_game_items_source ON COMMIT DROP AS
SELECT DISTINCT ON (lower(name)) *
FROM supabase_import.game_items
ORDER BY lower(name), id;

INSERT INTO supabase_import_report
SELECT 'game_items', pg_temp.import_table(
  'game_items',
  'supabase_game_items_source'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.game_items target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'professions', pg_temp.import_table(
  'professions',
  'supabase_import.professions'::regclass,
  jsonb_build_object(
    'magic_school_id', $expression$pg_temp.mapped_school(s.magic_school_id)$expression$
  ),
  '{}'::text[],
  'NOT EXISTS (SELECT 1 FROM public.professions target WHERE lower(target.name) = lower(s.name))',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'game_spells', pg_temp.import_table(
  'game_spells',
  'supabase_import.game_spells'::regclass,
  jsonb_build_object(
    'school_id', $expression$pg_temp.mapped_school(s.school_id)$expression$,
    'school', $expression$
      (SELECT school.name FROM public.magic_schools school WHERE school.id = pg_temp.mapped_school(s.school_id))
    $expression$,
    'casting_requirement', $expression$s.requirement$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'parties', pg_temp.import_table(
  'parties',
  'supabase_import.parties'::regclass,
  jsonb_build_object(
    'created_by', $expression$pg_temp.mapped_user(s.created_by)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'monsters', pg_temp.import_table(
  'monsters',
  'supabase_import.monsters'::regclass,
  jsonb_build_object(
    'created_by', $expression$pg_temp.mapped_user(s.created_by)$expression$,
    'effects_summary', $expression$s."effectsSummary"$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'characters', pg_temp.import_table(
  'characters',
  'supabase_import.characters'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$,
    'magic_school', $expression$pg_temp.mapped_school(s.magic_school)$expression$,
    'party_id', $expression$
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.parties party
          WHERE party.id = NULLIF(s.party_id, '')::uuid
        )
          THEN NULLIF(s.party_id, '')::uuid
        ELSE NULL
      END
    $expression$,
    'portrait_url', $expression$pg_temp.localize_storage_url(s.portrait_url)$expression$,
    'heroic_ability', $expression$
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(NULLIF(s.heroic_ability, '')::jsonb, '[]'::jsonb))
      )
    $expression$,
    'marked_skills', $expression$
      ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(NULLIF(s.marked_skills, '')::jsonb, '[]'::jsonb))
      )
    $expression$,
    'prepared_spells', $expression$
      ARRAY(
        SELECT DISTINCT spell_id
        FROM (
          SELECT jsonb_array_elements_text(
            COALESCE(NULLIF(s.prepared_spells, '')::jsonb, '[]'::jsonb)
          ) AS spell_id
          UNION ALL
          SELECT jsonb_array_elements_text(
            COALESCE(NULLIF(s.known_spell_ids, '')::jsonb, '[]'::jsonb)
          ) AS spell_id
        ) restored_spells
        ORDER BY spell_id
      )
    $expression$,
    'weak_spot', $expression$COALESCE(NULLIF(s.weak_spot, ''), NULLIF(s.flaw, ''))$expression$,
    'notes', $expression$
      CASE
        WHEN NULLIF(s.flaw, '') IS NOT NULL
         AND NULLIF(s.flaw, '') IS DISTINCT FROM NULLIF(s.weak_spot, '')
          THEN concat_ws(E'\n\n', NULLIF(s.notes, ''), 'Legacy flaw: ' || s.flaw)
        ELSE s.notes
      END
    $expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'compendium', pg_temp.import_table(
  'compendium',
  'supabase_import.compendium'::regclass,
  jsonb_build_object(
    'created_by', $expression$pg_temp.mapped_user(s.created_by)$expression$,
    'content', $expression$pg_temp.localize_storage_url(s.content)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'compendium_templates', pg_temp.import_table(
  'compendium_templates',
  'supabase_import.compendium_templates'::regclass,
  jsonb_build_object(
    'created_by', $expression$pg_temp.mapped_user(s.created_by)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_members', pg_temp.import_table(
  'party_members',
  'supabase_import.party_members'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'notes', pg_temp.import_table(
  'notes',
  'supabase_import.notes'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$,
    'content', $expression$pg_temp.localize_storage_url(s.content)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'messages', pg_temp.import_table(
  'messages',
  'supabase_import.messages'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_inventory', pg_temp.import_table(
  'party_inventory',
  'supabase_import.party_inventory'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_inventory_log', pg_temp.import_table(
  'party_inventory_log',
  'supabase_import.party_inventory_log'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_tasks', pg_temp.import_table(
  'party_tasks',
  'supabase_import.party_tasks'::regclass,
  jsonb_build_object(
    'created_by_user_id', $expression$pg_temp.mapped_user(s.created_by_user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'time_trackers', pg_temp.import_table(
  'time_trackers',
  'supabase_import.time_trackers'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'random_tables', pg_temp.import_table(
  'random_tables',
  'supabase_import.random_tables'::regclass,
  '{}'::jsonb,
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'story_ideas', pg_temp.import_table(
  'story_ideas',
  'supabase_import.story_ideas'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'encounters', pg_temp.import_table(
  'encounters',
  'supabase_import.encounters'::regclass,
  jsonb_build_object(
    'active_combatant_id', $expression$NULL::uuid$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'encounter_combatants', pg_temp.import_table(
  'encounter_combatants',
  'supabase_import.encounter_combatants'::regclass,
  jsonb_build_object(
    'is_player_character', $expression$
      COALESCE(s.is_player_character::boolean, NULLIF(s.character_id, '') IS NOT NULL)
    $expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

WITH updated AS (
  UPDATE public.encounters target
  SET active_combatant_id = source.active_combatant_id::uuid
  FROM supabase_import.encounters source
  WHERE target.id = source.id::uuid
    AND source.active_combatant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.encounter_combatants combatant
      WHERE combatant.id = source.active_combatant_id::uuid
    )
  RETURNING 1
)
INSERT INTO supabase_import_report
SELECT 'encounter_active_turns', count(*) FROM updated;

INSERT INTO supabase_import_report
SELECT 'party_maps', pg_temp.import_table(
  'party_maps',
  'supabase_import.party_maps'::regclass,
  jsonb_build_object(
    'image_url', $expression$pg_temp.localize_storage_url(s.image_url)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_map_drawings', pg_temp.import_table(
  'party_map_drawings',
  'supabase_import.party_map_drawings'::regclass,
  jsonb_build_object(
    'created_by', $expression$pg_temp.mapped_user(s.created_by)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'party_map_pins', pg_temp.import_table(
  'party_map_pins',
  'supabase_import.party_map_pins'::regclass,
  jsonb_build_object(
    'created_by', $expression$
      pg_temp.mapped_user(
        (SELECT party.created_by FROM supabase_import.parties party WHERE party.id = s.party_id)
      )
    $expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'legacy_map_pins', pg_temp.import_table(
  'party_map_pins',
  'supabase_import.map_pins'::regclass,
  jsonb_build_object(
    'created_by', $expression$
      pg_temp.mapped_user(
        (SELECT party.created_by FROM supabase_import.parties party WHERE party.id = s.party_id)
      )
    $expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'push_subscriptions', pg_temp.import_table(
  'push_subscriptions',
  'supabase_import.push_subscriptions'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report
SELECT 'user_notification_settings', pg_temp.import_table(
  'user_notification_settings',
  'supabase_import.user_notification_settings'::regclass,
  jsonb_build_object(
    'user_id', $expression$pg_temp.mapped_user(s.user_id)$expression$
  ),
  '{}'::text[],
  'true',
  'ON CONFLICT DO NOTHING'
);

INSERT INTO supabase_import_report VALUES
  ('expired_projector_sessions_skipped', (SELECT count(*) FROM supabase_import.party_display_sessions)),
  ('expired_projector_slots_skipped', (SELECT count(*) FROM supabase_import.party_display_slots)),
  ('legacy_acl_rows_archived', (SELECT count(*) FROM supabase_import.party_access_acl)),
  ('legacy_equipment_rows_archived', (SELECT count(*) FROM supabase_import.equipment));

DO $integrity$
DECLARE
  table_name text;
  missing bigint;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'characters',
    'compendium',
    'compendium_templates',
    'encounter_combatants',
    'encounters',
    'messages',
    'monsters',
    'notes',
    'parties',
    'party_inventory',
    'party_inventory_log',
    'party_map_drawings',
    'party_maps',
    'party_members',
    'party_tasks',
    'random_tables',
    'story_ideas',
    'time_trackers'
  ]
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM supabase_import.%I source '
      'LEFT JOIN public.%I target ON target.id = source.id::uuid '
      'WHERE target.id IS NULL',
      table_name,
      table_name
    ) INTO missing;
    IF missing <> 0 THEN
      RAISE EXCEPTION 'missing % imported IDs in public.%', missing, table_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM supabase_import.party_map_pins source
    LEFT JOIN public.party_map_pins target ON target.id = source.id::uuid
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.map_pins source
    LEFT JOIN public.party_map_pins target ON target.id = source.id::uuid
    WHERE target.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not every current and legacy map pin was imported';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_import.push_subscriptions source
    LEFT JOIN public.push_subscriptions target ON target.endpoint = source.endpoint
    WHERE target.endpoint IS NULL
  ) THEN
    RAISE EXCEPTION 'not every push-subscription endpoint was preserved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_import.user_notification_settings source
    JOIN supabase_user_id_map user_map ON user_map.source_id = source.user_id::uuid
    LEFT JOIN public.user_notification_settings target ON target.user_id = user_map.target_id
    WHERE target.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not every notification setting was preserved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_import.magic_schools source
    LEFT JOIN public.magic_schools target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.heroic_abilities source
    LEFT JOIN public.heroic_abilities target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.kin source
    LEFT JOIN public.kin target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.professions source
    LEFT JOIN public.professions target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.game_skills source
    LEFT JOIN public.game_skills target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM supabase_import.game_items source
    LEFT JOIN public.game_items target ON lower(target.name) = lower(source.name)
    WHERE target.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not every natural-key reference row was preserved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_import.game_spells source
    LEFT JOIN public.game_spells target ON target.id = source.id::uuid
    WHERE target.id IS NULL
  ) THEN
    RAISE EXCEPTION 'not every restored spell ID was imported';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_import.auth_users source
    JOIN supabase_auth_user_id_map user_map ON user_map.source_id = source.id::uuid
    LEFT JOIN public.app_credentials credential ON credential.user_id = user_map.target_id
    WHERE credential.user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'not every Supabase auth account has a local credential';
  END IF;
END
$integrity$;

SELECT step, affected
FROM supabase_import_report
ORDER BY step;

SELECT 'final_users' AS metric, count(*)::bigint AS value FROM public.users
UNION ALL SELECT 'final_credentials', count(*) FROM public.app_credentials
UNION ALL SELECT 'final_characters', count(*) FROM public.characters
UNION ALL SELECT 'final_parties', count(*) FROM public.parties
UNION ALL SELECT 'final_game_items', count(*) FROM public.game_items
UNION ALL SELECT 'final_game_spells', count(*) FROM public.game_spells
UNION ALL SELECT 'final_monsters', count(*) FROM public.monsters
UNION ALL SELECT 'final_compendium', count(*) FROM public.compendium
UNION ALL SELECT 'final_party_map_pins', count(*) FROM public.party_map_pins
ORDER BY metric;

\echo 'Supabase merge transaction is open; the caller must issue COMMIT or ROLLBACK.'
