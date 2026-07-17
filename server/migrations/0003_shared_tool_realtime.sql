CREATE UNIQUE INDEX IF NOT EXISTS time_trackers_party_id_unique
ON time_trackers(party_id);

DO $$
DECLARE
  table_to_watch text;
  trigger_name text;
BEGIN
  FOREACH table_to_watch IN ARRAY ARRAY[
    'notes',
    'party_tasks',
    'time_trackers',
    'random_tables',
    'story_ideas',
    'party_maps'
  ]
  LOOP
    trigger_name := table_to_watch || '_log_change';
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = format('public.%I', table_to_watch)::regclass
        AND tgname = trigger_name
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION log_app_change()',
        trigger_name,
        table_to_watch
      );
    END IF;
  END LOOP;
END
$$;
