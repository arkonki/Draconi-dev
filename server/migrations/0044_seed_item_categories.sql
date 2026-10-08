-- The starter seed originally used generic categories (Weapon, Armor, Gear) that the
-- application does not recognise, so seeded weapons and armor could not be equipped.
-- Only rows still carrying the old generic values are touched.
UPDATE game_items SET category = 'MELEE WEAPONS' WHERE name IN ('Broadsword', 'Staff') AND category = 'Weapon';
UPDATE game_items SET category = 'ARMOR & HELMETS' WHERE name IN ('Small Shield', 'Leather Armor') AND category = 'Armor';
UPDATE game_items SET category = 'LIGHT SOURCES' WHERE name IN ('Torch', 'Lantern') AND category = 'Gear';
UPDATE game_items SET category = 'TOOLS' WHERE name IN ('Rope', 'Blank Book', 'Quill') AND category = 'Gear';
