-- Personal access tokens: a way to connect an MCP client that cannot do the OAuth sign-in. They are ordinary
-- access tokens (hashed, scoped, expiring) kept under one built-in client, with a name so the owner can tell them apart.
ALTER TABLE oauth_access_tokens
  ADD COLUMN IF NOT EXISTS label text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 80);

INSERT INTO oauth_clients (client_id, client_name, redirect_uris)
VALUES ('personal-access-token', 'Personal access token', '[]'::jsonb)
ON CONFLICT (client_id) DO NOTHING;
