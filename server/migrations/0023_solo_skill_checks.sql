INSERT INTO solo_rule_tables (
  table_key, version, locale, die_sides, source_kind, display_name, entries
) VALUES
(
  'solo_dragon_effect', 'draconi-generic-v1', 'en', 6, 'generic', 'Solo Dragon effect prompts',
  '[
    {"min":1,"max":1,"key":"useful_resource","label":"Gain or preserve a useful resource"},
    {"min":2,"max":2,"key":"faster_action","label":"Complete the action faster than expected"},
    {"min":3,"max":3,"key":"impress_or_distract","label":"Impress, persuade, or distract someone nearby"},
    {"min":4,"max":4,"key":"opportunity_or_clue","label":"Reveal an opportunity, clue, or useful opening"},
    {"min":5,"max":5,"key":"beneficial_side_effect","label":"Create a beneficial side effect"},
    {"min":6,"max":6,"key":"greater_result","label":"Achieve a greater result than originally intended"}
  ]'::jsonb
),
(
  'solo_demon_effect', 'draconi-generic-v1', 'en', 6, 'generic', 'Solo Demon effect prompts',
  '[
    {"min":1,"max":1,"key":"item_lost_or_broken","label":"An item is lost, depleted, or damaged"},
    {"min":2,"max":2,"key":"costly_delay","label":"A costly delay gives the opposition time to act"},
    {"min":3,"max":3,"key":"unwanted_attention","label":"The action attracts unwanted attention"},
    {"min":4,"max":4,"key":"new_danger","label":"A new danger enters the scene"},
    {"min":5,"max":5,"key":"reaction_or_trap","label":"Trigger a hostile reaction or hidden trap"},
    {"min":6,"max":6,"key":"collateral_damage","label":"Cause collateral damage or self-injury"}
  ]'::jsonb
)
ON CONFLICT (table_key, version, locale) DO NOTHING;
