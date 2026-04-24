CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  coins INT DEFAULT 0
);

CREATE TABLE delivered_rewards (
  id SERIAL PRIMARY KEY,
  reward_hash TEXT UNIQUE
);

CREATE TABLE reward_queue (
  id SERIAL PRIMARY KEY,
  discord_id TEXT,
  minecraft_name TEXT,
  command TEXT,
  status TEXT,
  reward_hash TEXT,
  created_at BIGINT
);
