-- Weapon skills that were wrong or missing in the shared item list. A morningstar is a hammer and a halberd a spear.
-- A shield hits with BRAWLING (STR), so with a skill it gets an attack and STR damage bonus like any other weapon.
UPDATE game_items SET skill = 'Hammers(STR)'
WHERE party_id IS NULL AND lower(regexp_replace(name, '\s', '', 'g')) = 'morningstar';

UPDATE game_items SET skill = 'Spears(STR)'
WHERE party_id IS NULL AND lower(btrim(name)) = 'halberd';

UPDATE game_items SET skill = 'Brawling(STR)'
WHERE party_id IS NULL AND lower(btrim(name)) ~ '^shield\M' AND coalesce(btrim(skill), '') = '';
