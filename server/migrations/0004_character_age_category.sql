ALTER TABLE characters
  ALTER COLUMN age TYPE text
  USING age::text;
