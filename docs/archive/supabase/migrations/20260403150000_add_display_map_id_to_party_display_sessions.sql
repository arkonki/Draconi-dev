ALTER TABLE public.party_display_sessions
  ADD COLUMN IF NOT EXISTS display_map_id UUID REFERENCES public.party_maps(id) ON DELETE SET NULL;
