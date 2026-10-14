-- Optional monthly limits on the built-in AI, set by each person for their own key, and what each narrator reply used.
ALTER TABLE user_ai_settings
  ADD COLUMN IF NOT EXISTS monthly_cost_cap_usd numeric CHECK (monthly_cost_cap_usd IS NULL OR (monthly_cost_cap_usd >= 0 AND monthly_cost_cap_usd <= 100000)),
  ADD COLUMN IF NOT EXISTS monthly_token_cap integer CHECK (monthly_token_cap IS NULL OR monthly_token_cap >= 0);

ALTER TABLE solo_narrator_turns
  ADD COLUMN IF NOT EXISTS tokens integer,
  ADD COLUMN IF NOT EXISTS cost_usd numeric;
