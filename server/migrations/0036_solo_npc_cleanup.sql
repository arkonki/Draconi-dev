CREATE OR REPLACE FUNCTION delete_solo_npc_monster()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM monsters WHERE id = OLD.monster_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER solo_npcs_delete_monster
  AFTER DELETE ON solo_npcs
  FOR EACH ROW EXECUTE FUNCTION delete_solo_npc_monster();

DELETE FROM monsters monster
WHERE monster.stats ? 'SIMPLE_NPC_TEMPLATE'
  AND NOT EXISTS (
    SELECT 1 FROM solo_npcs npc WHERE npc.monster_id = monster.id
  );
