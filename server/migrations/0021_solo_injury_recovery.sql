ALTER TABLE character_injuries
  ADD COLUMN IF NOT EXISTS recovery_status text,
  ADD COLUMN IF NOT EXISTS remaining_healing_shifts integer,
  ADD COLUMN IF NOT EXISTS medical_care_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS treatment_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_treatment_shift integer,
  ADD COLUMN IF NOT EXISTS healed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_reason text;

UPDATE character_injuries
SET recovery_status = CASE
  WHEN status = 'healed' THEN 'healed'
  WHEN permanent THEN 'permanent'
  ELSE 'untreated'
END
WHERE recovery_status IS NULL;

UPDATE character_injuries
SET remaining_healing_shifts = healing_days * 4
WHERE status = 'active'
  AND NOT permanent
  AND healing_days IS NOT NULL
  AND remaining_healing_shifts IS NULL;

ALTER TABLE character_injuries
  ALTER COLUMN recovery_status SET DEFAULT 'untreated',
  ALTER COLUMN recovery_status SET NOT NULL;

ALTER TABLE character_injuries
  DROP CONSTRAINT IF EXISTS character_injuries_recovery_status_check,
  ADD CONSTRAINT character_injuries_recovery_status_check
    CHECK (recovery_status IN ('untreated', 'recovering', 'healed', 'permanent')),
  DROP CONSTRAINT IF EXISTS character_injuries_remaining_healing_shifts_check,
  ADD CONSTRAINT character_injuries_remaining_healing_shifts_check
    CHECK (remaining_healing_shifts IS NULL OR remaining_healing_shifts >= 0),
  DROP CONSTRAINT IF EXISTS character_injuries_treatment_attempts_check,
  ADD CONSTRAINT character_injuries_treatment_attempts_check
    CHECK (treatment_attempts >= 0),
  DROP CONSTRAINT IF EXISTS character_injuries_last_treatment_shift_check,
  ADD CONSTRAINT character_injuries_last_treatment_shift_check
    CHECK (last_treatment_shift IS NULL OR last_treatment_shift >= 0);

CREATE INDEX IF NOT EXISTS character_injuries_recovery_idx
  ON character_injuries(campaign_id, character_id, recovery_status, created_at DESC);
