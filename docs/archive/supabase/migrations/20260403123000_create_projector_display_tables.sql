CREATE TABLE IF NOT EXISTS public.party_display_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '12 hours'),
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.party_display_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.party_display_sessions(id) ON DELETE CASCADE,
  corner TEXT NOT NULL CHECK (corner IN ('top_left', 'top_right', 'bottom_left', 'bottom_right')),
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  rotation_deg INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, corner),
  UNIQUE (session_id, sort_order)
);

CREATE INDEX IF NOT EXISTS idx_party_display_sessions_party_id
  ON public.party_display_sessions (party_id);

CREATE INDEX IF NOT EXISTS idx_party_display_sessions_expires_at
  ON public.party_display_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_party_display_slots_session_id
  ON public.party_display_slots (session_id);

CREATE INDEX IF NOT EXISTS idx_party_display_slots_character_id
  ON public.party_display_slots (character_id);

DROP TRIGGER IF EXISTS on_party_display_sessions_updated ON public.party_display_sessions;
CREATE TRIGGER on_party_display_sessions_updated
  BEFORE UPDATE ON public.party_display_sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS on_party_display_slots_updated ON public.party_display_slots;
CREATE TRIGGER on_party_display_slots_updated
  BEFORE UPDATE ON public.party_display_slots
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.party_display_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_display_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "DMs can manage projector display sessions" ON public.party_display_sessions;
CREATE POLICY "DMs can manage projector display sessions"
  ON public.party_display_sessions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.parties p
      WHERE p.id = party_display_sessions.party_id
        AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.parties p
      WHERE p.id = party_display_sessions.party_id
        AND p.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "DMs can manage projector display slots" ON public.party_display_slots;
CREATE POLICY "DMs can manage projector display slots"
  ON public.party_display_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.party_display_sessions s
      JOIN public.parties p ON p.id = s.party_id
      WHERE s.id = party_display_slots.session_id
        AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.party_display_sessions s
      JOIN public.parties p ON p.id = s.party_id
      WHERE s.id = party_display_slots.session_id
        AND p.created_by = auth.uid()
    )
  );
