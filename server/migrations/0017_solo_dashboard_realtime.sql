DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.campaign_events'::regclass
      AND tgname = 'campaign_events_log_change'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER campaign_events_log_change
      AFTER INSERT OR UPDATE OR DELETE ON campaign_events
      FOR EACH ROW EXECUTE FUNCTION log_app_change();
  END IF;
END
$$;
