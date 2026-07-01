CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id       VARCHAR(255) UNIQUE NOT NULL,
  github_username VARCHAR(255) NOT NULL,
  github_token    TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  repo_full_name  VARCHAR(255) NOT NULL,
  backend_token   VARCHAR(255) UNIQUE NOT NULL,
  config          JSONB DEFAULT '{}',
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id           UUID REFERENCES repos(id) ON DELETE CASCADE,
  pr_number         INTEGER NOT NULL,
  pr_title          VARCHAR(500),
  pr_author         VARCHAR(255),
  pr_url            TEXT,
  review_state      VARCHAR(50) NOT NULL,
  summary           TEXT,
  comments          JSONB DEFAULT '[]',
  comment_count     INTEGER DEFAULT 0,
  commit_sha        VARCHAR(255),
  github_review_id  BIGINT,
  reviewed_at       TIMESTAMP DEFAULT NOW()
);