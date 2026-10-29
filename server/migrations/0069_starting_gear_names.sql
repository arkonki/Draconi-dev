-- Starting gear names that matched no item in the shared list, so new heroes got items without stats or weight.
-- Character creation now ignores spacing and punctuation ("Warhammer (light)" finds "Warhammer, Light"); these are
-- the names that still differed. The lists are comma separated, so a name with a comma cannot be written here.
UPDATE professions p
SET starting_equipment = fixed.list
FROM (
  SELECT id, jsonb_agg(
    regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
      replace(line, E'­', ''),
      '\mMorning star\M', 'Morningstar', 'gi'),
      'Rope \(hemp\)', 'Rope(Hemp) 10 meters', 'gi'),
      '\mFood rations\M', 'Field rations', 'gi'),
      '\mQuill\M(?!\s*&)', 'Quill & Ink', 'gi'),
      'Book \(any subject\)', 'Book', 'gi'),
      '\s*,\s*', ', ', 'g')
    ORDER BY position) AS list
  FROM professions, jsonb_array_elements_text(starting_equipment) WITH ORDINALITY AS lines(line, position)
  WHERE jsonb_typeof(starting_equipment) = 'array'
  GROUP BY id
) fixed
WHERE fixed.id = p.id AND p.starting_equipment IS DISTINCT FROM fixed.list;
