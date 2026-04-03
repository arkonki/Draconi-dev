ALTER TABLE public.party_display_sessions
  ADD COLUMN IF NOT EXISTS display_image_url TEXT;
