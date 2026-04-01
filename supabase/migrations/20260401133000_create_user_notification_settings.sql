DO $$
BEGIN
  IF to_regclass('public.user_notification_settings') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_new_message_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_new_message'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN email_new_message_enabled TO email_new_message';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_party_invite_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_party_invite'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN email_party_invite_enabled TO email_party_invite';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_session_scheduled_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_session_scheduled'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN email_session_scheduled_enabled TO email_session_scheduled';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_system_updates_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'email_system_updates'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN email_system_updates_enabled TO email_system_updates';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_new_message_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_new_message'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN desktop_new_message_enabled TO desktop_new_message';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_party_invite_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_party_invite'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN desktop_party_invite_enabled TO desktop_party_invite';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_session_scheduled_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_session_scheduled'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN desktop_session_scheduled_enabled TO desktop_session_scheduled';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_dice_rolls_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'desktop_dice_rolls'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN desktop_dice_rolls_enabled TO desktop_dice_rolls';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'sound_dice_rolls_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'sound_dice_rolls'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN sound_dice_rolls_enabled TO sound_dice_rolls';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'sound_notifications_enabled'
    ) AND NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_notification_settings'
        AND column_name = 'sound_notifications'
    ) THEN
      EXECUTE 'ALTER TABLE public.user_notification_settings RENAME COLUMN sound_notifications_enabled TO sound_notifications';
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_new_message BOOLEAN NOT NULL DEFAULT TRUE,
  email_party_invite BOOLEAN NOT NULL DEFAULT TRUE,
  email_session_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  email_system_updates BOOLEAN NOT NULL DEFAULT FALSE,
  desktop_new_message BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_party_invite BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_session_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  desktop_dice_rolls BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sound_volume INTEGER NOT NULL DEFAULT 80 CHECK (sound_volume BETWEEN 0 AND 100),
  sound_dice_rolls BOOLEAN NOT NULL DEFAULT TRUE,
  sound_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS email_new_message BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_party_invite BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_session_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_system_updates BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS desktop_new_message BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS desktop_party_invite BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS desktop_session_scheduled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS desktop_dice_rolls BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sound_volume INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS sound_dice_rolls BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sound_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.user_notification_settings
  DROP CONSTRAINT IF EXISTS user_notification_settings_sound_volume_check;

ALTER TABLE public.user_notification_settings
  ADD CONSTRAINT user_notification_settings_sound_volume_check
  CHECK (sound_volume BETWEEN 0 AND 100);

CREATE UNIQUE INDEX IF NOT EXISTS user_notification_settings_user_id_key
  ON public.user_notification_settings (user_id);

CREATE INDEX IF NOT EXISTS user_notification_settings_user_id_idx
  ON public.user_notification_settings (user_id);

ALTER TABLE public.user_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_user_notification_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_notification_settings_set_updated_at
  ON public.user_notification_settings;

CREATE TRIGGER user_notification_settings_set_updated_at
BEFORE UPDATE ON public.user_notification_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_user_notification_settings_updated_at();

DROP POLICY IF EXISTS "Users can read own notification settings"
  ON public.user_notification_settings;
CREATE POLICY "Users can read own notification settings"
ON public.user_notification_settings
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification settings"
  ON public.user_notification_settings;
CREATE POLICY "Users can insert own notification settings"
ON public.user_notification_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification settings"
  ON public.user_notification_settings;
CREATE POLICY "Users can update own notification settings"
ON public.user_notification_settings
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification settings"
  ON public.user_notification_settings;
CREATE POLICY "Users can delete own notification settings"
ON public.user_notification_settings
FOR DELETE
USING (auth.uid() = user_id);
