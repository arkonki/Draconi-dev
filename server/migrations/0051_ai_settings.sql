-- Built-in AI (OpenRouter): each person can store their own API key on the server, encrypted, and choose a model.
-- The key never goes back to the browser (only a short hint such as "…a1b2"), and calls to the model are made by
-- the server. Every call is counted so people can see what they use. These tables are not reachable through the
-- generic data endpoint.
CREATE TABLE IF NOT EXISTS user_ai_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openrouter' CHECK (provider IN ('openrouter')),
  api_key_encrypted text,
  key_hint text,
  model text NOT NULL DEFAULT 'google/gemini-2.0-flash-001' CHECK (char_length(model) BETWEEN 3 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_id uuid REFERENCES parties(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  -- As reported by the provider, in US dollars, when it reports one.
  cost_usd numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx ON ai_usage (user_id, created_at DESC);
