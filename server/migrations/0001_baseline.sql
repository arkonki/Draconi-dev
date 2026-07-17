DO $$
DECLARE
  required_table text;
BEGIN
  FOREACH required_table IN ARRAY ARRAY[
    'users',
    'app_credentials',
    'app_sessions',
    'characters',
    'parties',
    'party_members',
    'encounters',
    'party_display_sessions'
  ]
  LOOP
    IF to_regclass(format('public.%I', required_table)) IS NULL THEN
      RAISE EXCEPTION 'Baseline schema is missing required table: %', required_table;
    END IF;
  END LOOP;
END
$$;
