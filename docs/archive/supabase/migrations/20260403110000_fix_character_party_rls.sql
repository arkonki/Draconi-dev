ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Character Visibility" ON public.characters;
DROP POLICY IF EXISTS "Character Modification" ON public.characters;
DROP POLICY IF EXISTS "Character Deletion" ON public.characters;

CREATE POLICY "Character Visibility"
ON public.characters
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.created_by = auth.uid()
      AND (
        p.id = public.characters.party_id
        OR EXISTS (
          SELECT 1
          FROM public.party_members pm
          WHERE pm.party_id = p.id
            AND pm.character_id = public.characters.id
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.party_members target_pm
    JOIN public.party_members self_pm
      ON self_pm.party_id = target_pm.party_id
    WHERE target_pm.character_id = public.characters.id
      AND self_pm.user_id = auth.uid()
  )
);

CREATE POLICY "Character Modification"
ON public.characters
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.created_by = auth.uid()
      AND (
        p.id = public.characters.party_id
        OR EXISTS (
          SELECT 1
          FROM public.party_members pm
          WHERE pm.party_id = p.id
            AND pm.character_id = public.characters.id
        )
      )
  )
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.parties p
    WHERE p.created_by = auth.uid()
      AND (
        p.id = public.characters.party_id
        OR EXISTS (
          SELECT 1
          FROM public.party_members pm
          WHERE pm.party_id = p.id
            AND pm.character_id = public.characters.id
        )
      )
  )
);

CREATE POLICY "Character Deletion"
ON public.characters
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
