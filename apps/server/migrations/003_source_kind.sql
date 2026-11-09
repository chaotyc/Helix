-- What kind of source material each extraction was given: a syllabus, a table of contents,
-- notes, or something else. Part of the input, so it's kept with the text (D3).
-- Sources saved before this migration get "other".

ALTER TABLE source ADD COLUMN kind TEXT NOT NULL DEFAULT 'other'
  CHECK (kind IN ('syllabus', 'contents', 'notes', 'other'));
