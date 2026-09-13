PRAGMA foreign_keys = ON;

-- Dokumen sumber (buku, transkrip, dokumen lain) — metadata saja, file fisik di data/raw/
CREATE TABLE documents (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    source_type     TEXT NOT NULL CHECK (source_type IN ('book','interview_transcript','document','field_note','other')),
    file_path       TEXT NOT NULL,          -- path relatif ke data/raw/
    participant_id  TEXT,                   -- untuk IPA: wajib diisi, satu kasus = satu participant_id
    added_at        TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now')),
    metadata_json   TEXT                    -- konteks tambahan (demografi, tanggal wawancara, dsb.)
);

-- Unit makna hasil segmentasi (bukan potongan kalimat buta)
CREATE TABLE units (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id     INTEGER NOT NULL REFERENCES documents(id),
    sequence_index  INTEGER NOT NULL,       -- urutan dalam dokumen, untuk rekonstruksi konteks
    speaker         TEXT,                   -- untuk transkrip; NULL untuk buku/dokumen
    text            TEXT NOT NULL,
    paralinguistic_notes TEXT,              -- jeda, overlap, penekanan (penting untuk IPA)
    UNIQUE(document_id, sequence_index)
);

-- Method run: satu "sesi analisis" terikat pada satu metode
CREATE TABLE method_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method          TEXT NOT NULL CHECK (method IN ('ta_classic','rta','ipa','grounded_theory')),
    project_label   TEXT NOT NULL,
    started_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now')),
    status          TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','saturated','closed')),
    config_snapshot_json TEXT               -- salinan config/methods/*.yaml saat run dimulai
);

-- Kode inisial (open coding) — level unit
CREATE TABLE codes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method_run_id   INTEGER NOT NULL REFERENCES method_runs(id),
    unit_id         INTEGER NOT NULL REFERENCES units(id),
    label           TEXT NOT NULL,
    justification   TEXT,                   -- alasan model mengusulkan kode ini
    coding_level    TEXT CHECK (coding_level IN ('descriptive','linguistic','conceptual')), -- relevan untuk IPA
    status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','validated','revised','rejected')),
    created_by      TEXT NOT NULL DEFAULT 'model' CHECK (created_by IN ('model','human')),
    created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))
);

-- Kategori/Tema (level agregasi di atas kode) — mendukung hierarki tema/subtema
CREATE TABLE categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method_run_id   INTEGER NOT NULL REFERENCES method_runs(id),
    parent_id       INTEGER REFERENCES categories(id),  -- untuk subtema, atau kategori->core category (GT)
    label           TEXT NOT NULL,
    definition      TEXT,
    category_type   TEXT CHECK (category_type IN (
                        'theme','subtheme',                         -- TA/RTA
                        'PET','GET',                                 -- IPA (Personal/Group Experiential Theme)
                        'open_category','axial_category','core_category' -- GT
                    )),
    is_deviant_case TEXT CHECK (is_deviant_case IN ('yes','no')) DEFAULT 'no',
    status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','validated','revised','rejected')),
    created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))
);

-- Relasi banyak-ke-banyak kode -> kategori
CREATE TABLE code_category_links (
    code_id         INTEGER NOT NULL REFERENCES codes(id),
    category_id     INTEGER NOT NULL REFERENCES categories(id),
    PRIMARY KEY (code_id, category_id)
);

-- Relasi antarkategori (khusus GT axial coding: kausal, kondisional, kontekstual, dsb.)
CREATE TABLE category_relations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method_run_id   INTEGER NOT NULL REFERENCES method_runs(id),
    source_category_id INTEGER NOT NULL REFERENCES categories(id),
    target_category_id INTEGER NOT NULL REFERENCES categories(id),
    relation_type   TEXT CHECK (relation_type IN ('causal','contextual','intervening','strategy','consequence')),
    description     TEXT
);

-- Memo reflektif (model-generated dan human-authored, dibedakan created_by)
CREATE TABLE memos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method_run_id   INTEGER NOT NULL REFERENCES method_runs(id),
    related_code_id     INTEGER REFERENCES codes(id),
    related_category_id INTEGER REFERENCES categories(id),
    content         TEXT NOT NULL,
    created_by      TEXT NOT NULL CHECK (created_by IN ('model','human')),
    created_at      TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))
);

-- Audit trail setiap pemanggilan API
CREATE TABLE audit_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    method_run_id   INTEGER REFERENCES method_runs(id),
    stage           TEXT NOT NULL,          -- 'open_coding','axial_coding','ipa_noting', dsb.
    prompt_text     TEXT NOT NULL,
    response_text   TEXT NOT NULL,
    model_used      TEXT NOT NULL,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    called_at       TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))
);

-- Antrean validasi manusia (state machine eksplisit, terpisah dari status kolom di atas
-- agar riwayat revisi tidak hilang)
CREATE TABLE validation_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type     TEXT NOT NULL CHECK (target_type IN ('code','category')),
    target_id       INTEGER NOT NULL,
    action          TEXT NOT NULL CHECK (action IN ('validated','revised','rejected')),
    previous_label  TEXT,
    new_label       TEXT,
    reviewer_note   TEXT,
    reviewed_at     TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%S+00:00','now'))
);

CREATE INDEX idx_units_document ON units(document_id);
CREATE INDEX idx_codes_unit ON codes(unit_id);
CREATE INDEX idx_codes_run ON codes(method_run_id);
CREATE INDEX idx_categories_run ON categories(method_run_id);
