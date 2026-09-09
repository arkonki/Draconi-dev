INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'inspiration_action', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo action inspiration',
  '["Avenge","Control","Craft","Deliver","Destroy","Escape","Find","Guard","Hunt","Infiltrate","Protect","Rescue","Restore","Scavenge","Search","Seize","Stop","Strengthen","Summon","Weaken"]'::jsonb
),
(
  'inspiration_attribute', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo attribute inspiration',
  '["Ancient","Arcane","Blocked","Corrupted","Cursed","Damaged","Dangerous","Decaying","Destroyed","Flooded","Forgotten","Secret","Lost","Mighty","Moving","Peaceful","Protected","Sacred","Transformed","Violent"]'::jsonb
),
(
  'inspiration_thing', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo thing inspiration',
  '["Barrier","Captivity","Conflict","Creature","Death","Defense","Device","Group","History","Knowledge","Leader","Message","Path","Person","Power","Refuge","Resource","Trap","Treasure","Weapon"]'::jsonb
),
(
  'solo_dragon_effect', 'user-solo-v1', 'en', 6, 'user_data_pack', 'Solo Dragon effects',
  '[
    {"min":1,"max":1,"key":"helpful_item_or_resource","label":"You uncover a helpful item or resource"},
    {"min":2,"max":2,"key":"faster_than_usual","label":"The action is performed faster than usual"},
    {"min":3,"max":3,"key":"impress_or_distract","label":"You impress others or create a distraction"},
    {"min":4,"max":4,"key":"opportunity_or_clue","label":"You reveal a new opportunity or clue"},
    {"min":5,"max":5,"key":"beneficial_effect","label":"You trigger an unexpected beneficial effect"},
    {"min":6,"max":6,"key":"greater_results","label":"The action yields greater results than usual"}
  ]'::jsonb
),
(
  'solo_demon_effect', 'user-solo-v1', 'en', 6, 'user_data_pack', 'Solo Demon effects',
  '[
    {"min":1,"max":1,"key":"important_item_lost_or_broken","label":"An important item is lost or broken"},
    {"min":2,"max":2,"key":"dangerous_delay","label":"You suffer a dangerous delay"},
    {"min":3,"max":3,"key":"unwanted_attention","label":"You draw unwanted attention"},
    {"min":4,"max":4,"key":"new_danger","label":"You stumble into a new danger"},
    {"min":5,"max":5,"key":"reaction_or_trap","label":"You trigger an unexpected reaction or trap"},
    {"min":6,"max":6,"key":"collateral_damage","label":"You cause collateral damage or injure yourself"}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO UPDATE SET
  die_sides = EXCLUDED.die_sides,
  source_kind = EXCLUDED.source_kind,
  display_name = EXCLUDED.display_name,
  entries = EXCLUDED.entries;
