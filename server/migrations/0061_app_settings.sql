-- Server-wide settings that an administrator changes in the app (currently the outgoing email / SMTP setup).
-- Secrets inside a value (such as the SMTP password) are stored encrypted.
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
