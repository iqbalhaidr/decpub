/**
 * Skema SQLite, berversi. Tambahkan migrasi baru di akhir daftar; jangan ubah yang lama.
 *
 * Port dari skema Postgres Roihan (`backend-go/internal/db/migrations`), disederhanakan:
 * tanpa cermin data on-chain (sumber kebenaran status ada di chain), tanpa `wallet_address`
 * dan kunci sesi (A4: kunci tidak pernah di server).
 */
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  email                 TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('author','reviewer','editor','admin')),
  specialities          TEXT NOT NULL DEFAULT '[]',
  verified_fields       TEXT NOT NULL DEFAULT '[]',
  identity_commitment   TEXT UNIQUE,
  permanent_address     TEXT UNIQUE,
  identity_registered_at TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE categories (
  slug  TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE journals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  category_slug TEXT NOT NULL REFERENCES categories(slug),
  apc_wei       TEXT NOT NULL,
  weight_policy TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE reviewer_field_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  fields     TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','superseded')),
  decided_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_field_requests_status ON reviewer_field_requests(status);

-- Penunjuk ke naskah. Berkas asli dan identitas ada di private store (terenkripsi), bukan di sini.
CREATE TABLE manuscripts (
  id                TEXT PRIMARY KEY,
  owner_user_id     TEXT NOT NULL REFERENCES users(id),
  journal_id        INTEGER NOT NULL REFERENCES journals(id),
  session_id        TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  original_hash     TEXT NOT NULL,
  anonymized_hash   TEXT NOT NULL,
  metadata_hash     TEXT NOT NULL,
  anonymized_cid    TEXT NOT NULL,
  anonymized_uri    TEXT NOT NULL,
  metadata_cid      TEXT NOT NULL,
  metadata_uri      TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  submitted_at      TEXT,
  published_to_storage_at TEXT
);
CREATE INDEX idx_manuscripts_owner ON manuscripts(owner_user_id);
`,
  },
];
