CREATE TABLE campaign_time_roll_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 200),
  dice_expression text NOT NULL CHECK (char_length(dice_expression) BETWEEN 2 AND 50),
  interval_unit text NOT NULL CHECK (interval_unit IN ('round', 'stretch', 'shift')),
  interval_count integer NOT NULL CHECK (interval_count BETWEEN 1 AND 1000),
  next_due_count bigint NOT NULL CHECK (next_due_count > 0),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX campaign_time_roll_reminders_active_idx
  ON campaign_time_roll_reminders(campaign_id, active, next_due_count);

CREATE TRIGGER campaign_time_roll_reminders_set_updated_at
BEFORE UPDATE ON campaign_time_roll_reminders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE campaign_time_roll_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  session_id uuid REFERENCES game_sessions(id) ON DELETE SET NULL,
  reminder_id uuid REFERENCES campaign_time_roll_reminders(id) ON DELETE SET NULL,
  label text NOT NULL,
  dice_expression text NOT NULL,
  notes text,
  due_unit text NOT NULL CHECK (due_unit IN ('round', 'stretch', 'shift')),
  due_count bigint NOT NULL CHECK (due_count > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reminder_id, due_count)
);

CREATE INDEX campaign_time_roll_notifications_pending_idx
  ON campaign_time_roll_notifications(campaign_id, status, created_at DESC);

DO $$
DECLARE
  table_to_watch text;
  trigger_name text;
BEGIN
  FOREACH table_to_watch IN ARRAY ARRAY[
    'campaign_time_roll_reminders',
    'campaign_time_roll_notifications'
  ]
  LOOP
    trigger_name := table_to_watch || '_log_change';
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
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
