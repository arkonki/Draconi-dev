-- Append-only record of administrator actions on user accounts. The target is stored as a plain id and
-- email snapshot with no foreign key, so entries survive the deletion of the account they describe.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON admin_audit_log (target_user_id, created_at DESC);
