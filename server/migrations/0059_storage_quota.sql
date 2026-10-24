-- Who uploaded each stored image and how large it is, so a per-user storage quota can be enforced on the server.
-- Objects uploaded before this migration have no row; they are not counted against anyone.
CREATE TABLE IF NOT EXISTS storage_objects (
  bucket text NOT NULL,
  path text NOT NULL,
  owner_id uuid REFERENCES users(id) ON DELETE SET NULL,
  size bigint NOT NULL CHECK (size >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, path)
);

CREATE INDEX IF NOT EXISTS storage_objects_owner_idx ON storage_objects (owner_id);
