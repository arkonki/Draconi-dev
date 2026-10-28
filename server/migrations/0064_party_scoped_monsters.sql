-- Monsters and NPCs a GM makes for one campaign belong to that campaign, like its custom items. Monsters without a
-- party are the shared bestiary.
ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS party_id uuid REFERENCES parties(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS monsters_party_id_idx ON monsters (party_id) WHERE party_id IS NOT NULL;

-- Solo NPCs were already made for one campaign each, but their monster rows were shared. Hand each to its campaign.
UPDATE monsters m
SET party_id = owner.campaign_id
FROM (
  SELECT monster_id, min(campaign_id::text)::uuid AS campaign_id
  FROM solo_npcs
  WHERE monster_id IS NOT NULL
  GROUP BY monster_id
  HAVING count(DISTINCT campaign_id) = 1
) owner
WHERE m.id = owner.monster_id AND m.party_id IS NULL;
