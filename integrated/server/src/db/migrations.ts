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
  {
    version: 2,
    sql: `
-- Undangan editor dan penelaah (P05-P06). Server tepercaya untuk pemetaan undangan ke orang
-- (arsitektur bagian 3); pseudonim yang menerima undangan TIDAK disimpan di sini.
CREATE TABLE invitations (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL,
  role                  TEXT NOT NULL CHECK (role IN ('editor','reviewer')),
  -- 0 untuk editor, nomor batch seleksi untuk penelaah (slot pseudonim, keputusan B3)
  slot                  INTEGER NOT NULL,
  user_id               TEXT NOT NULL REFERENCES users(id),
  invite_salt           TEXT NOT NULL,
  assignment_commitment TEXT NOT NULL,
  criteria_hash         TEXT NOT NULL,
  criteria_fields       TEXT NOT NULL,
  proof_ref             TEXT NOT NULL,
  proof_uri             TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  accepted_at           TEXT,
  UNIQUE (session_id, assignment_commitment)
);
CREATE INDEX idx_invitations_user ON invitations(user_id);
CREATE INDEX idx_invitations_session ON invitations(session_id, role, slot);

-- Kriteria penelaah yang ditetapkan editor, per revisi sesi. Sumber untuk seleksi batch berikutnya.
CREATE TABLE session_criteria (
  session_id    TEXT NOT NULL,
  revision      INTEGER NOT NULL,
  fields        TEXT NOT NULL,
  criteria_hash TEXT NOT NULL,
  recorded_at   TEXT NOT NULL,
  PRIMARY KEY (session_id, revision)
);
`,
  },
  {
    version: 3,
    sql: `
-- Revisi naskah (M5). Revisi 0 adalah baris di \`manuscripts\`; tiap revisi berikutnya satu baris di sini.
-- \`recorded_at\` kosong = sudah di-intake dan menunggu tanda tangan pseudonim Author (staging).
CREATE TABLE manuscript_revisions (
  manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id),
  revision        INTEGER NOT NULL,
  original_hash   TEXT NOT NULL,
  anonymized_hash TEXT NOT NULL,
  metadata_hash   TEXT NOT NULL,
  anonymized_cid  TEXT NOT NULL,
  anonymized_uri  TEXT NOT NULL,
  metadata_cid    TEXT NOT NULL,
  metadata_uri    TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  recorded_at     TEXT,
  PRIMARY KEY (manuscript_id, revision)
);

-- Undangan yang batch-nya ditinggalkan karena tidak ada penelaah yang reveal (no-show). Tetap tercatat
-- supaya orangnya tidak diundang lagi pada ronde yang sama.
ALTER TABLE invitations ADD COLUMN voided_at TEXT;
`,
  },
  {
    version: 4,
    sql: `
-- Kebijakan bobot insentif yang DIKUNCI saat sesi dibuat (D1, M7). Perubahan kebijakan jurnal sesudahnya
-- tidak memengaruhi sesi ini. \`policy_json\` persis yang di-hash (\`policy_hash\`, dicatat on-chain saat distribusi).
CREATE TABLE session_policies (
  session_id  TEXT PRIMARY KEY,
  journal_id  INTEGER NOT NULL,
  preset      TEXT NOT NULL,
  lambda      REAL NOT NULL,
  policy_json TEXT NOT NULL,
  policy_hash TEXT NOT NULL,
  locked_at   TEXT NOT NULL,
  -- 1 bila sesi dibuat sebelum kebijakan terkunci dan kebijakan jurnal saat penyelesaian dipakai.
  locked_late INTEGER NOT NULL DEFAULT 0
);

-- Tingkat reputasi (q4) yang dibuktikan penelaah untuk pseudonim sesinya. Hanya pseudonim dan tingkat;
-- reputationId tidak pernah sampai ke server pada langkah ini.
CREATE TABLE reputation_tiers (
  session_id  TEXT NOT NULL,
  pseudonym   TEXT NOT NULL,
  tier        INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 4),
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (session_id, pseudonym)
);

-- Laporan QoS yang diunggah ke storage publik; hash-nya masuk transaksi \`executeDistribution\`.
CREATE TABLE incentive_reports (
  session_id  TEXT PRIMARY KEY,
  report_cid  TEXT NOT NULL,
  report_hash TEXT NOT NULL,
  tx_hash     TEXT NOT NULL,
  executed_at TEXT NOT NULL
);

-- Antrian klaim reputasi menunggu epoch. Tanpa sesi dan tanpa pseudonim, sengaja: yang diketahui server
-- hanya (reputationId, jumlah, nullifier, bukti). Pengiriman digabung dan diacak saat epoch dipicu admin.
CREATE TABLE reputation_claim_queue (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reputation_id TEXT NOT NULL,
  amount        TEXT NOT NULL,
  nullifier     TEXT NOT NULL UNIQUE,
  proof         TEXT NOT NULL,
  queued_at     TEXT NOT NULL,
  minted_tx     TEXT,
  minted_at     TEXT
);
`,
  },
  {
    version: 5,
    sql: `
-- Selective disclosure (P08, M8). Satu baris per (sesi, peran): hanya atribut yang DIPILIH pengguna yang tersimpan,
-- bersama salt supaya siapa pun dapat menghitung ulang hash atribut yang tercatat on-chain. Isi ini publik
-- (artikel menampilkannya); atribut yang tidak dipilih tidak pernah masuk tabel ini.
-- \`original_cid\` terisi bila penulis juga membuka naskah asli; \`original_uploaded_at\` kosong = CID sudah tercatat
-- on-chain tetapi berkas belum terunggah (diulang pada permintaan berikutnya).
CREATE TABLE disclosures (
  session_id            TEXT NOT NULL,
  role                  INTEGER NOT NULL CHECK (role IN (0, 2)),
  user_id               TEXT NOT NULL REFERENCES users(id),
  pseudonym             TEXT NOT NULL,
  permanent_account     TEXT NOT NULL,
  attributes_json       TEXT NOT NULL,
  salt                  TEXT NOT NULL,
  attributes_hash       TEXT NOT NULL,
  original_cid          TEXT,
  original_uploaded_at  TEXT,
  tx_hash               TEXT NOT NULL,
  disclosed_at          TEXT NOT NULL,
  PRIMARY KEY (session_id, role)
);

-- Isi komentar pembaca; hash-nya ada on-chain (\`DOIToken.CommentPosted\`). \`handle\` hanya nama tampilan per artikel.
CREATE TABLE comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    TEXT NOT NULL,
  doi_token_id  INTEGER NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id),
  handle        TEXT NOT NULL,
  body          TEXT NOT NULL,
  nonce         TEXT NOT NULL,
  content_hash  TEXT NOT NULL UNIQUE,
  tx_hash       TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_comments_session ON comments(session_id);
`,
  },
];
