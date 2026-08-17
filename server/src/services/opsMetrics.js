import { aggregateProductAnalytics } from './productAnalytics.js';

function propertiesOf(row) {
  if (row.properties && typeof row.properties === 'object') return row.properties;
  try { return JSON.parse(row.properties || '{}'); } catch { return {}; }
}

function maskedSessionId(value) {
  const id = String(value || '');
  return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export function projectRecentSessions(rows = [], limit = 50) {
  const sessions = new Map();
  const ordered = [...rows].sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  for (const row of ordered) {
    const sessionId = row.deliberation_session_id || row.session_id;
    if (!sessionId) continue;
    const properties = propertiesOf(row);
    const current = sessions.get(sessionId) || {
      id: maskedSessionId(sessionId),
      startedAt: row.occurred_at,
      lastSeenAt: row.occurred_at,
      phase: '',
      completed: false,
      llmRequests: 0,
      llmFailures: 0,
      artworkStatus: 'not_requested',
      errorCode: '',
      mode: row.mode || 'standard',
      deviceClass: row.device_class || 'unknown',
      releaseId: row.release_id || 'unknown',
    };
    current.lastSeenAt = row.occurred_at;
    if (['phase_entered', 'phase_enter'].includes(row.event_name)) current.phase = String(properties.phase || '').slice(0, 40);
    if (row.event_name === 'deliberation_completed' || current.phase === 'final') current.completed = true;
    if (['llm_request_completed', 'llm_result'].includes(row.event_name)) {
      current.llmRequests += 1;
      if (properties.success === false) current.llmFailures += 1;
    }
    if (['artwork_request_completed', 'artwork_job_completed'].includes(row.event_name)) current.artworkStatus = properties.success ? 'success' : 'failed';
    if (['client_error', 'error'].includes(row.event_name)) current.errorCode = String(properties.errorCode || 'CLIENT_ERROR').slice(0, 80);
    sessions.set(sessionId, current);
  }
  return [...sessions.values()].sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt)).slice(0, limit);
}

export function buildOpsMetrics(rows = [], feedbackRows = [], options = {}) {
  const metrics = aggregateProductAnalytics(rows, options);
  const helpful = feedbackRows.filter((row) => row.helpfulness === 'helpful').length;
  return {
    ...metrics,
    feedbackSummary: {
      total: feedbackRows.length,
      helpful,
      helpfulRate: { numerator: helpful, denominator: feedbackRows.length, rate: feedbackRows.length ? helpful / feedbackRows.length : null },
    },
    recentSessions: projectRecentSessions(rows),
  };
}

export default { buildOpsMetrics, projectRecentSessions };
