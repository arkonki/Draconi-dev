/*
  # Create bio_data table

  This table stores lists of options for character creation, such as appearance traits, mementos, and flaws. These can be grouped into named sets (e.g., "Human Commoner", "Dwarven Noble").

  1. New Tables
    - `bio_data`
      - `id` (uuid, primary key): Unique identifier for the bio data set.
      - `name` (text, unique): The name of the data set (e.g., "General Options").
      - `appearance` (jsonb): A list of appearance descriptions.
      - `mementos` (jsonb): A list of possible mementos.
      - `flaws` (jsonb): A list of potential flaws or weak spots.
      - `created_at` (timestamptz): Timestamp of creation.

  2. Security
    - Enable RLS on `bio_data` table.
    - Add policy for authenticated users to read all data.
    - Add policy for `service_role` to perform all actions (for admin panel).
*/

CREATE TABLE IF NOT EXISTS bio_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  appearance jsonb NOT NULL DEFAULT '[]'::jsonb,
  mementos jsonb NOT NULL DEFAULT '[]'::jsonb,
  flaws jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bio_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read bio_data"
  ON bio_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service_role to manage bio_data"
  ON bio_data
  FOR ALL
  TO service_role
  USING (true);