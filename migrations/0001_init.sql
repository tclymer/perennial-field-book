-- Perennial Field Book sync schema (DESIGN.md §8.3). Times are Unix milliseconds.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  picture TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One row per sign-in attempt, deleted when the callback returns.
CREATE TABLE auth_states (
  state TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- One-time codes that carry a fresh session from the callback redirect into the app.
CREATE TABLE handoffs (
  code TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE members (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, user_id)
);
CREATE INDEX members_user ON members(user_id);

CREATE TABLE invites (
  token TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX invites_farm ON invites(farm_id);

-- The shared log. seq orders arrival across all farms; clients pull "after seq" per farm.
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  received_at INTEGER NOT NULL,
  UNIQUE (farm_id, id)
);
CREATE INDEX events_farm_seq ON events(farm_id, seq);

CREATE TABLE photos (
  farm_id TEXT NOT NULL REFERENCES farms(id),
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (farm_id, id)
);
