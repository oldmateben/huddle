-- Presenter accounts. Participants never get a row here.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0,
  terms_version TEXT,
  terms_accepted_at TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE memberships (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member')),
  added_by TEXT,
  added_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX memberships_user ON memberships(user_id);

-- A deck is a saved presentation. Its live state and responses live in the
-- Durable Object named by its code.
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'ink',
  anonymous INTEGER NOT NULL DEFAULT 0,
  questions TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX decks_team ON decks(team_id);

-- Live-session request counts, flushed from each Durable Object.
CREATE TABLE usage_daily (
  day TEXT NOT NULL,
  code TEXT NOT NULL,
  requests INTEGER NOT NULL,
  PRIMARY KEY (day, code)
);
