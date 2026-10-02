-- Modifiers are opt-in bonuses for carrying equipment, not ordinary item weight.
-- Preserve existing game data; non-container modifiers are ignored by the calculator.
ALTER TABLE game_items ALTER COLUMN encumbrance_modifier SET DEFAULT 0;
