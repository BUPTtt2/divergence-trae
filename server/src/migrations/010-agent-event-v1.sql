-- AgentEventV1：会话内严格游标、因果关系与浏览器可见性
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS sequence INTEGER;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS actor_id TEXT;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS causation_id TEXT;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS correlation_id TEXT;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS visibility TEXT;
ALTER TABLE deliberation_events ADD COLUMN IF NOT EXISTS schema_version INTEGER;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at, id) AS seq
  FROM deliberation_events
)
UPDATE deliberation_events e
SET sequence = ranked.seq
FROM ranked
WHERE e.id = ranked.id AND e.sequence IS NULL;

UPDATE deliberation_events SET actor_id = COALESCE(actor_id, actor, 'system') WHERE actor_id IS NULL;
UPDATE deliberation_events SET correlation_id = COALESCE(correlation_id, 'corr_' || id) WHERE correlation_id IS NULL;
UPDATE deliberation_events
SET visibility = CASE
  WHEN type IN ('THOUGHT', 'ACTION', 'REACT_THINK', 'REACT_ACT', 'REACT_OBSERVE', 'AUDIT_EVENT') THEN 'internal'
  WHEN type IN ('OBSERVATION', 'ERROR', 'AUDIT_ALERT') THEN 'summary'
  ELSE 'public'
END
WHERE visibility IS NULL;
UPDATE deliberation_events SET schema_version = COALESCE(schema_version, 1) WHERE schema_version IS NULL;

ALTER TABLE deliberation_events ALTER COLUMN sequence SET NOT NULL;
ALTER TABLE deliberation_events ALTER COLUMN actor_id SET NOT NULL;
ALTER TABLE deliberation_events ALTER COLUMN correlation_id SET NOT NULL;
ALTER TABLE deliberation_events ALTER COLUMN visibility SET NOT NULL;
ALTER TABLE deliberation_events ALTER COLUMN schema_version SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_session_sequence
  ON deliberation_events(session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_session_visibility_sequence
  ON deliberation_events(session_id, visibility, sequence);
