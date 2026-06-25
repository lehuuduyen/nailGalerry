-- NailLib → Neon Postgres schema.
-- Adjusted to the ACTUAL data shape found by migrate/inspect.ts:
--   users.json has { id, username, salt, passwordHash, createdAt } — no email,
--   so the users table uses username + salt (salt is required by scrypt login).

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS designs (
  id              TEXT PRIMARY KEY,
  title           TEXT,
  style           TEXT,
  color           TEXT,
  shape           TEXT,
  length          TEXT,
  occasion        TEXT,
  mood            TEXT,
  technique       TEXT,
  detail          TEXT,
  image_url       TEXT NOT NULL,      -- R2 URL after re-host
  original_url    TEXT,               -- source image URL (Instagram CDN) for reference
  contributor     TEXT,
  owner_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  source_platform TEXT,
  source_handle   TEXT,
  source_url      TEXT,
  status          TEXT DEFAULT 'approved',
  caption         TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Added after initial migration: Instagram imports carry a caption used for AI
-- tagging. Safe to run on an existing table.
ALTER TABLE designs ADD COLUMN IF NOT EXISTS caption TEXT;

-- Global like ("tym") counter shown on each design.
ALTER TABLE designs ADD COLUMN IF NOT EXISTS like_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS likes (
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  design_id  TEXT REFERENCES designs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, design_id)
);

-- Indexes to serve the AI Advisor's attribute filtering.
CREATE INDEX IF NOT EXISTS idx_designs_style    ON designs(style);
CREATE INDEX IF NOT EXISTS idx_designs_color    ON designs(color);
CREATE INDEX IF NOT EXISTS idx_designs_shape    ON designs(shape);
CREATE INDEX IF NOT EXISTS idx_designs_occasion ON designs(occasion);
CREATE INDEX IF NOT EXISTS idx_designs_mood     ON designs(mood);
CREATE INDEX IF NOT EXISTS idx_designs_status   ON designs(status);
CREATE INDEX IF NOT EXISTS idx_designs_owner    ON designs(owner_id);

-- ─────────────────────────────────────────────────────────────────────────
--  Enrichment / SEO expansion (additive — never drops existing columns).
--  New filter tags split out of the overloaded ones (season ← occasion,
--  style_origin ← mood) plus skin tone / undertone, plus SEO fields.
-- ─────────────────────────────────────────────────────────────────────────

-- SEO / display
ALTER TABLE designs ADD COLUMN IF NOT EXISTS slug         TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS alt_text     TEXT;

-- filter tags (new)
ALTER TABLE designs ADD COLUMN IF NOT EXISTS accent_colors TEXT[] DEFAULT '{}';
ALTER TABLE designs ADD COLUMN IF NOT EXISTS season        TEXT;   -- split from occasion
ALTER TABLE designs ADD COLUMN IF NOT EXISTS style_origin  TEXT;   -- e.g. Korean (split from mood)
ALTER TABLE designs ADD COLUMN IF NOT EXISTS skin_tone     TEXT;   -- Fair/Light/Medium/Tan/Deep
ALTER TABLE designs ADD COLUMN IF NOT EXISTS undertone     TEXT;   -- Warm/Cool/Neutral

-- Unique slug (idempotent via unique index rather than a named constraint).
CREATE UNIQUE INDEX IF NOT EXISTS idx_designs_slug ON designs(slug);

CREATE INDEX IF NOT EXISTS idx_designs_season    ON designs(season);
CREATE INDEX IF NOT EXISTS idx_designs_skin_tone ON designs(skin_tone);
CREATE INDEX IF NOT EXISTS idx_designs_origin    ON designs(style_origin);
CREATE INDEX IF NOT EXISTS idx_designs_accent    ON designs USING GIN (accent_colors);
