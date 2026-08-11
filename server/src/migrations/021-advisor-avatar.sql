ALTER TABLE custom_advisors
  ADD COLUMN IF NOT EXISTS avatar TEXT;

ALTER TABLE published_advisors
  ADD COLUMN IF NOT EXISTS avatar TEXT;
