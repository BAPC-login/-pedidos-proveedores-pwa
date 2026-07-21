CREATE TABLE IF NOT EXISTS file_chunks (
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data_base64 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_file_chunks_file ON file_chunks(file_id, chunk_index);
