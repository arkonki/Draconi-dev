INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'solo_search', 'user-solo-v1', 'en', 10, 'user_data_pack', 'Solo Search',
  '[
    {"min":1,"max":1,"key":"concealed_foe","label":"Concealed foe - you are forewarned and have a boon on your first action against it","kind":"danger","boon_on_first_action":true},
    {"min":2,"max":2,"key":"trap","label":"Trap - to disarm, roll Sleight of Hand with a boon, then roll on this table again, ignoring this result","kind":"trap","required_check":{"skill":"Sleight of Hand","modifier":"boon"},"reroll_after_resolution":true},
    {"min":3,"max":3,"key":"secret_path","label":"Secret path - diverts to D4 new waypoints","kind":"path","waypoint_count_die":{"count":1,"sides":4}},
    {"min":4,"max":5,"key":"hidden_antechamber","label":"Hidden antechamber - roll for location details","kind":"location","location_details":true},
    {"min":6,"max":8,"key":"hidden_treasure","label":"Hidden treasure - one treasure card","kind":"treasure","treasure_cards":1},
    {"min":9,"max":10,"key":"hidden_vault","label":"Hidden vault - two treasure cards, and roll again","kind":"treasure","treasure_cards":2,"reroll":true}
  ]'::jsonb
),
(
  'solo_scavenge', 'user-solo-v1', 'en', 10, 'user_data_pack', 'Solo Scavenge',
  '[
    {"min":1,"max":1,"key":"unexpected_danger","label":"Unexpected danger","kind":"danger","subtable_key":"solo_scavenge_danger"},
    {"min":2,"max":4,"key":"nothing","label":"Nothing of note","kind":"nothing"},
    {"min":5,"max":5,"key":"supplies","label":"Supplies","kind":"supplies","subtable_key":"solo_scavenge_supplies"},
    {"min":6,"max":6,"key":"interesting_item","label":"Interesting item","kind":"item","subtable_key":"solo_scavenge_interesting_item"},
    {"min":7,"max":9,"key":"treasure","label":"One treasure card","kind":"treasure","treasure_cards":1},
    {"min":10,"max":10,"key":"treasure_and_reroll","label":"One treasure card, and roll again","kind":"treasure","treasure_cards":1,"reroll":true}
  ]'::jsonb
),
(
  'solo_scavenge_danger', 'user-solo-v1', 'en', 4, 'user_data_pack', 'Solo Scavenge - Unexpected Danger',
  '["Creature","Cursed item","Noxious spores","Trap"]'::jsonb
),
(
  'solo_scavenge_supplies', 'user-solo-v1', 'en', 6, 'user_data_pack', 'Solo Scavenge - Supplies',
  '["Bandages","Field ration","Fine clothes","Lockpicks","Quiver of arrows","Torch"]'::jsonb
),
(
  'solo_scavenge_interesting_item', 'user-solo-v1', 'en', 4, 'user_data_pack', 'Solo Scavenge - Interesting Item',
  '["Key","Map","Strange device","Written message"]'::jsonb
),
(
  'solo_location_detail', 'user-solo-v1', 'en', 4, 'user_data_pack', 'Solo Location Details',
  '[
    {"key":"contents","label":"Contents","subtable_key":"solo_location_contents"},
    {"key":"environment","label":"Environment","subtable_key":"solo_location_environment"},
    {"key":"oddity","label":"Oddity","subtable_key":"solo_location_oddity"},
    {"key":"danger","label":"Danger","subtable_key":"solo_location_danger"}
  ]'::jsonb
),
(
  'solo_area', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Area',
  '["Abandoned outpost","Ancient tomb","Burrowed tunnel","Claustrophobic crawlspace","Confounding maze","Cramped chamber","Excavated mine","Expansive hall","Forgotten library","Idle workshop","Inhabited outpost","Lofty bridge","Narrow staircase","Natural cave","Plunging shaft","Precarious ladderway","Subterranean river","Twisting passage","Vile temple","Yawning chasm"]'::jsonb
),
(
  'solo_inhabitants', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Inhabitants',
  '[
    {"min":1,"max":1,"label":"Dragons"},{"min":2,"max":6,"label":"Orcs"},
    {"min":7,"max":7,"label":"Adventurers"},{"min":8,"max":8,"label":"Ghosts"},
    {"min":9,"max":9,"label":"Giant spiders"},{"min":10,"max":10,"label":"Goblins"},
    {"min":11,"max":11,"label":"Harpies"},{"min":12,"max":12,"label":"Skeletons"},
    {"min":13,"max":13,"label":"Trolls"},{"min":14,"max":14,"label":"Vampiric bats"},
    {"min":15,"max":19,"label":"Cultists"},{"min":20,"max":20,"label":"Demons"}
  ]'::jsonb
),
(
  'solo_location_contents', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Location Contents',
  '["Abandoned supplies","Bloody trail","Breached doorway","Cracked terrain","Decrepit shrine","Deep well","Dusty tomes","Flaming braziers","Foul nest","Fresh corpses","Makeshift barricade","Moldering tapestries","Mummified corpses","Ornate sarcophagi","Remote encampment","Scattered bones","Sealed antechamber","Toppled pillars","Towering statues","Wandering adventurer"]'::jsonb
),
(
  'solo_location_environment', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Location Environment',
  '["Bubbling pool","Chilling cold","Clinging webs","Concealing mist","Corroded surfaces","Creeping vines","Dripping water","Dusty air","Flourishing fungus","Glassy surfaces","Glowing crystals","Luminescent spores","Mechanical whirring","Oppressive heat","Ragged scratches","Rotting stench","Skittering sounds","Slimy surfaces","Smoke-filled air","Stagnant pool"]'::jsonb
),
(
  'solo_location_oddity', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Location Oddity',
  '["Arcane symbols","Confounding puzzle","Enigmatic mechanisms","Esoteric architecture","Fleshy terrain","Flourishing tree","Ghostly apparition","Gigantic corpse","Hovering sphere","Humming obelisk","Magic mirror","Mystical light","Reversed gravity","Sentient door","Shifting architecture","Singing skulls","Swirling portal","Talking statue","Unnatural darkness","Unsettling laughter"]'::jsonb
),
(
  'solo_location_danger', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Location Danger',
  '["Acid pools","Ambushing foe","Approaching foe","Arcane trickery","Broken path","Crumbling terrain","Dreadful altar","Fiery surroundings","Flooded space","Flowing magma","Hidden trap","Icy surfaces","Imminent collapse","Imperiled adventurer","Inhabited lair","Ominous wardrums","Scalding steam","Scrawled warning","Sealed doorway","Toxic fumes"]'::jsonb
),
(
  'solo_traps', 'user-solo-v1', 'en', 20, 'user_data_pack', 'Solo Traps',
  '[
    {"min":1,"max":1,"label":"Acid spray"},{"min":2,"max":2,"label":"Arcane blast"},
    {"min":3,"max":3,"label":"Collapsing trapdoor (new waypoint)"},{"min":4,"max":4,"label":"Collapsing trapdoor (pit)"},
    {"min":5,"max":5,"label":"Crushing walls"},{"min":6,"max":6,"label":"Entangling snare"},
    {"min":7,"max":7,"label":"Flaming spout"},{"min":8,"max":8,"label":"Flooding chamber"},
    {"min":9,"max":9,"label":"Piercing spikes"},{"min":10,"max":10,"label":"Poison dart"},
    {"min":11,"max":11,"label":"Poisonous gas"},{"min":12,"max":12,"label":"Ringing alarm"},
    {"min":13,"max":13,"label":"Rolling boulder"},{"min":14,"max":14,"label":"Shooting arrow"},
    {"min":15,"max":15,"label":"Spinning blades"},{"min":16,"max":16,"label":"Teleporting sigil (new waypoint)"},
    {"min":17,"max":17,"label":"Unleashed foe"},{"min":18,"max":20,"label":"Roll twice, ignoring this result","reroll_count":2}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO UPDATE SET
  die_sides = EXCLUDED.die_sides,
  source_kind = EXCLUDED.source_kind,
  display_name = EXCLUDED.display_name,
  entries = EXCLUDED.entries;
