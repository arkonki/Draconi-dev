DROP TRIGGER campaign_events_prevent_update ON campaign_events;

CREATE TRIGGER campaign_events_prevent_update
  BEFORE UPDATE ON campaign_events
  FOR EACH ROW EXECUTE FUNCTION prevent_campaign_event_mutation();

