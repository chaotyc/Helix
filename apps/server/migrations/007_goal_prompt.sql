-- The new-goal form asks for a title and a prompt: the learner's own words about what they
-- want and why. Goals saved before this migration get an empty prompt.

ALTER TABLE goal ADD COLUMN prompt TEXT NOT NULL DEFAULT ''
