-- Bootstrap reference content only. This is not a restoration of the lost Supabase data.
INSERT INTO magic_schools (id, name, description) VALUES
  ('10000000-0000-4000-8000-000000000001', 'Mentalism', 'Mind, perception, and force.'),
  ('10000000-0000-4000-8000-000000000002', 'Animism', 'Nature, life, and transformation.'),
  ('10000000-0000-4000-8000-000000000003', 'Elementalism', 'Fire, air, earth, and water.')
ON CONFLICT (name) DO NOTHING;

INSERT INTO kin (id, name, description, heroic_ability, key_attribute, typical_profession) VALUES
  ('20000000-0000-4000-8000-000000000001', 'Human', 'Adaptable and ambitious folk found throughout the world.', 'Adaptable', 'WIL', 'Fighter'),
  ('20000000-0000-4000-8000-000000000002', 'Elf', 'Long-lived wanderers with keen senses.', 'Inner Peace', 'AGL', 'Hunter'),
  ('20000000-0000-4000-8000-000000000003', 'Dwarf', 'Resolute craftspeople of the mountains.', 'Unforgiving', 'CON', 'Artisan')
ON CONFLICT (name) DO NOTHING;

INSERT INTO heroic_abilities (id, name, description, willpower_cost, profession, kin) VALUES
  ('30000000-0000-4000-8000-000000000001', 'Adaptable', 'Choose a trained skill appropriate to the current challenge.', 3, NULL, 'Human'),
  ('30000000-0000-4000-8000-000000000002', 'Guardian', 'Step in to protect an ally within reach.', 3, 'Fighter', NULL),
  ('30000000-0000-4000-8000-000000000003', 'Inner Peace', 'Recover composure during a short rest.', 3, NULL, 'Elf')
ON CONFLICT (name) DO NOTHING;

INSERT INTO game_heroic_abilities (id, name, description, willpower_cost, profession, kin)
SELECT id, name, description, willpower_cost, profession, kin FROM heroic_abilities
ON CONFLICT (name) DO NOTHING;

INSERT INTO professions (
  id, name, description, key_attribute, skills, heroic_ability,
  starting_equipment, equipment_description
) VALUES (
  '40000000-0000-4000-8000-000000000001', 'Fighter',
  'A trained combatant comfortable on the front line.', 'STR',
  ARRAY['Axes','Brawling','Evade','Spears','Swords','Spot Hidden'], 'Guardian',
  '["Broadsword", "Small Shield", "Leather Armor", "Torch", "Rope"]'::jsonb,
  '["A dependable melee weapon", "A light shield", "Light protection", "Basic adventuring supplies"]'::jsonb
), (
  '40000000-0000-4000-8000-000000000002', 'Mage',
  'A student of magic and hidden knowledge.', 'INT',
  ARRAY['Languages','Myths & Legends','Spot Hidden','Mentalism','Animism','Elementalism'], 'Inner Peace',
  '["Staff", "Lantern", "Rope", "Blank Book", "Quill"]'::jsonb,
  '["A sturdy staff", "Tools for study and travel"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO game_skills (name, base_attribute, category) VALUES
  ('Acrobatics','AGL','Secondary'), ('Awareness','INT','Secondary'),
  ('Axes','STR','Weapon'), ('Bluffing','CHA','Secondary'),
  ('Brawling','STR','Weapon'), ('Bushcraft','INT','Secondary'),
  ('Crafting','STR','Secondary'), ('Evade','AGL','Secondary'),
  ('Hammers','STR','Weapon'), ('Healing','INT','Secondary'),
  ('Hunting & Fishing','AGL','Secondary'), ('Knives','AGL','Weapon'),
  ('Languages','INT','Secondary'), ('Mentalism','WIL','Magic'),
  ('Animism','WIL','Magic'), ('Elementalism','WIL','Magic'),
  ('Myths & Legends','INT','Secondary'), ('Performance','CHA','Secondary'),
  ('Persuasion','CHA','Secondary'), ('Riding','AGL','Secondary'),
  ('Seamanship','AGL','Secondary'), ('Sleight of Hand','AGL','Secondary'),
  ('Sneaking','AGL','Secondary'), ('Spears','STR','Weapon'),
  ('Spot Hidden','INT','Secondary'), ('Staves','AGL','Weapon'),
  ('Swords','STR','Weapon'), ('Swimming','AGL','Secondary')
ON CONFLICT (name) DO NOTHING;

INSERT INTO game_spells (name, rank, school, school_id, description, willpower_cost) VALUES
  ('Sense Magic',0,'Mentalism','10000000-0000-4000-8000-000000000001','Detect nearby magical traces.',1),
  ('Flicker',0,'Mentalism','10000000-0000-4000-8000-000000000001','Create a brief distracting illusion.',1),
  ('Guiding Thought',0,'Mentalism','10000000-0000-4000-8000-000000000001','Sharpen an ally''s focus.',1),
  ('Mind Shield',1,'Mentalism','10000000-0000-4000-8000-000000000001','Guard a mind against intrusion.',2),
  ('Force Push',1,'Mentalism','10000000-0000-4000-8000-000000000001','Push a nearby target with invisible force.',2),
  ('Read Emotion',1,'Mentalism','10000000-0000-4000-8000-000000000001','Sense the strongest surface emotion.',2),
  ('Nature Sign',0,'Animism','10000000-0000-4000-8000-000000000002','Read a simple sign from the natural world.',1),
  ('Spark',0,'Elementalism','10000000-0000-4000-8000-000000000003','Create a harmless spark or tiny flame.',1)
ON CONFLICT (name, school_id) DO NOTHING;

INSERT INTO game_items (name, category, cost, weight, description, damage, equippable) VALUES
  ('Broadsword','Weapon','50 silver',1.0,'A balanced one-handed sword.','2D6',true),
  ('Small Shield','Armor','20 silver',1.0,'A light shield.',NULL,true),
  ('Leather Armor','Armor','25 silver',2.0,'Light protective clothing.',NULL,true),
  ('Staff','Weapon','5 silver',1.0,'A sturdy wooden staff.','D8',true),
  ('Torch','Gear','1 copper',0.25,'Provides light.',NULL,false),
  ('Rope','Gear','2 silver',1.0,'Ten meters of strong rope.',NULL,false),
  ('Lantern','Gear','8 silver',0.5,'A shuttered oil lantern.',NULL,false),
  ('Blank Book','Gear','10 silver',0.5,'A bound book of blank pages.',NULL,false),
  ('Quill','Gear','1 copper',0.0,'A writing quill.',NULL,false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO bio_data (name, appearance, mementos, flaws) VALUES (
  'Adventurer',
  '["Weathered", "Well dressed", "Alert", "Travel stained"]'::jsonb,
  '["A family token", "An old map", "A broken signet", "A lucky charm"]'::jsonb,
  '["Reckless", "Suspicious", "Proud", "Too curious"]'::jsonb
)
ON CONFLICT (name) DO NOTHING;
