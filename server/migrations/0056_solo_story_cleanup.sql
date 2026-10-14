-- When a Solo mission ends, the creatures that belonged to it leave the story. "Retired" marks them: neither defeated nor
-- fled, just no longer part of play. (Dangers already have "resolved" and "avoided".)
ALTER TABLE solo_npcs DROP CONSTRAINT IF EXISTS solo_npcs_status_check;
ALTER TABLE solo_npcs
  ADD CONSTRAINT solo_npcs_status_check CHECK (status IN ('active', 'fled', 'surrendered', 'defeated', 'retired'));
