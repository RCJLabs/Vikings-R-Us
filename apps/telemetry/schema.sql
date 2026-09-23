-- Opt-in alpha telemetry (docs/privacy.md). No ids tie rows to people: each
-- shift gets a random id when it arrives, and only the day is kept, not the time.
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  received_on TEXT NOT NULL,
  target TEXT NOT NULL,
  content TEXT NOT NULL,
  g INTEGER NOT NULL,
  mode TEXT NOT NULL,
  n INTEGER,
  day INTEGER NOT NULL,
  layout TEXT NOT NULL,
  untimed INTEGER NOT NULL,
  sun_ms INTEGER NOT NULL,
  ended_by TEXT NOT NULL,
  guard TEXT NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  spare_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS souls (
  shift_id TEXT NOT NULL REFERENCES shifts(id),
  i INTEGER NOT NULL,
  arch TEXT NOT NULL,
  rule TEXT NOT NULL,
  expected TEXT NOT NULL,
  stamped TEXT,
  correct INTEGER NOT NULL,
  sun_ms INTEGER NOT NULL,
  penalty_ms INTEGER NOT NULL,
  flipped INTEGER NOT NULL,
  tools TEXT NOT NULL,
  looked TEXT NOT NULL,
  missed TEXT NOT NULL,
  lies INTEGER NOT NULL,
  caught INTEGER NOT NULL,
  questioned INTEGER NOT NULL,
  bad_compares INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  proof_cost_s INTEGER NOT NULL,
  PRIMARY KEY (shift_id, i)
);

CREATE INDEX IF NOT EXISTS souls_by_rule ON souls (rule);

CREATE TABLE IF NOT EXISTS guard_mismatches (
  id TEXT PRIMARY KEY,
  received_on TEXT NOT NULL,
  target TEXT NOT NULL,
  content TEXT NOT NULL,
  g INTEGER NOT NULL,
  n INTEGER NOT NULL,
  expected TEXT NOT NULL,
  got TEXT NOT NULL,
  ua TEXT NOT NULL
);
