-- Pokes, shared notes, shared compendium entries and shared rolls were tags typed into a message's text, which
-- anyone could fake. They are now a kind with a payload the server checks.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_kind_check;
ALTER TABLE messages
  ADD CONSTRAINT messages_kind_check CHECK (kind IN ('text', 'poke', 'note', 'compendium', 'roll'));

-- Turn the old tags into kinds, so the chat no longer has to read tags at all.
UPDATE messages
SET kind = 'poke',
    payload = jsonb_build_object('targetUserId', substring(content FROM '<<<POKE:([^>]+)>>>')),
    content = COALESCE(NULLIF(btrim(regexp_replace(content, '<<<POKE:[^>]+>>>', '')), ''), 'Poke!')
WHERE kind = 'text' AND content ~ '<<<POKE:[^>]+>>>';

UPDATE messages
SET kind = 'note',
    payload = jsonb_build_object('noteId', substring(content FROM '<<<NOTE:([^:>]+):'), 'title', substring(content FROM '<<<NOTE:[^:>]+:([^>]+)>>>')),
    content = COALESCE(NULLIF(btrim(regexp_replace(content, '<<<NOTE:[^>]+>>>', '')), ''), 'Shared a note')
WHERE kind = 'text' AND content ~ '<<<NOTE:[^:>]+:[^>]+>>>';

UPDATE messages
SET kind = 'compendium',
    payload = jsonb_build_object('entryId', substring(content FROM '<<<COMPENDIUM:([^:>]+):'), 'title', substring(content FROM '<<<COMPENDIUM:[^:>]+:([^>]+)>>>')),
    content = COALESCE(NULLIF(btrim(regexp_replace(content, '<<<COMPENDIUM:[^>]+>>>', '')), ''), 'Shared an entry')
WHERE kind = 'text' AND content ~ '<<<COMPENDIUM:[^:>]+:[^>]+>>>';

UPDATE messages SET kind = 'roll' WHERE kind = 'text' AND content LIKE '🎲%';
