-- "Look here": a ping anyone at the table can drop on the map. Pings are short-lived; the function that creates
-- one also removes the sender's earlier pings and anything older than a few minutes, so the table stays tiny.
-- Only inserts are broadcast, so clearing old pings makes no noise.
CREATE TABLE IF NOT EXISTS table_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  map_id uuid NOT NULL REFERENCES party_maps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  x numeric NOT NULL CHECK (x >= 0 AND x <= 1),
  y numeric NOT NULL CHECK (y >= 0 AND y <= 1),
  color text NOT NULL DEFAULT '#facc15',
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 40),
  -- A GM ping that also moves everyone's view to the spot.
  focus boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS table_pings_party_created_idx ON table_pings (party_id, created_at DESC);

CREATE TRIGGER table_pings_log_change
  AFTER INSERT ON table_pings
  FOR EACH ROW EXECUTE FUNCTION log_app_change();
