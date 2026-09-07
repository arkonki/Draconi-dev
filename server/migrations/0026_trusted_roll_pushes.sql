ALTER TABLE roll_requests
  ADD COLUMN pushed_from_request_id uuid REFERENCES roll_requests(id) ON DELETE RESTRICT,
  ADD COLUMN push_condition text
    CHECK (push_condition IN (
      'exhausted', 'sickly', 'dazed', 'angry', 'scared', 'disheartened'
    )),
  ADD CONSTRAINT roll_requests_push_pair_check CHECK (
    (pushed_from_request_id IS NULL AND push_condition IS NULL)
    OR (pushed_from_request_id IS NOT NULL AND push_condition IS NOT NULL)
  ),
  ADD CONSTRAINT roll_requests_not_self_push_check CHECK (
    pushed_from_request_id IS NULL OR pushed_from_request_id <> id
  );

CREATE UNIQUE INDEX roll_requests_one_push_per_source_idx
  ON roll_requests(pushed_from_request_id)
  WHERE pushed_from_request_id IS NOT NULL;
