import { generateUUID } from '../utils/id.js';

export const FUNNEL_PHASES = [
  'input',
  'clarify_loop',
  'case_file_confirm',
  'agent_select',
  'agent_debate',
  'summary',
  'branch_select',
  'path_reveal',
  'final',
];

const EVENT_PROPERTIES = Object.freeze({
  app_opened: ['page'],
  anonymous_identity_ready: ['offline'],
  experience_entry_viewed: ['source'],
  kiosk_handoff_started: ['phase'],
  kiosk_handoff_completed: [],
  deliberation_started: ['phase', 'restored', 'errorCode'],
  phase_entered: ['phase'],
  phase_completed: ['phase', 'durationMs'],
  deliberation_completed: ['durationMs'],
  deliberation_abandoned: ['phase', 'durationMs'],
  session_restored: ['phase'],
  new_deliberation_requested: ['phase', 'source'],
  llm_request_completed: ['provider', 'model', 'success', 'durationMs', 'retryCount', 'errorCode', 'usageAvailable'],
  fallback_activated: ['phase', 'fallbackType', 'errorCode'],
  artwork_request_completed: ['provider', 'model', 'success', 'durationMs', 'retryCount', 'errorCode'],
  artwork_job_started: ['cardId', 'styleId', 'includedCredit'],
  artwork_job_completed: ['cardId', 'styleId', 'success', 'durationMs', 'errorCode', 'persistent', 'includedCredit'],
  artwork_version_selected: ['cardId', 'styleId', 'persistent'],
  client_error: ['phase', 'errorCode', 'source'],
  api_health_observed: ['success', 'durationMs', 'errorCode'],
  destiny_card_saved: ['storageMode'],
  destiny_card_shared: ['shareChannel'],
  outcome_revisit_submitted: ['withOutcome'],
  feedback_submitted: ['helpfulness', 'tags', 'feedbackId'],
  ops_accessed: ['surface'],
  feedback_reviewed: ['reviewStatus'],
  phase_enter: ['phase'],
  phase_exit: ['phase'],
  llm_call: ['agentId'],
  llm_result: ['agentId', 'success', 'durationMs', 'errorCode'],
  share: ['cardId', 'shareChannel'],
  revisit: ['cardId', 'withOutcome'],
  fate_edit_start: ['gua'],
  fate_edit_save: ['gua', 'summaryLen'],
  web_vital_lcp: ['value', 'page'],
  web_vital_cls: ['value', 'page'],
  web_vital_inp: ['value', 'page'],
  error: ['phase', 'errorCode', 'source'],
});

function cleanText(value, max = 120) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function cleanProperties(eventName, properties) {
  const source = properties && typeof properties === 'object' ? properties : {};
  const allowed = EVENT_PROPERTIES[eventName] || [];
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = source[key];
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return [[key, value.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 12)]];
    if (typeof value === 'string') return [[key, cleanText(value, 120)]];
    if (typeof value === 'number') return [[key, Number.isFinite(value) ? value : 0]];
    if (typeof value === 'boolean') return [[key, value]];
    return [];
  }));
}

export function normalizeProductEvent(event, { principalId, now = Date.now() } = {}) {
  const eventName = cleanText(event?.event, 80);
  if (!eventName || !Object.hasOwn(EVENT_PROPERTIES, eventName) || !principalId) return null;
  const timestamp = Number(event?.timestamp);
  const occurredAt = new Date(Number.isFinite(timestamp) && timestamp > 0 ? timestamp : now).toISOString();
  const deliberationSessionId = cleanText(event?.deliberationSessionId || event?.sessionId, 120);
  return {
    id: generateUUID(),
    user_id: principalId,
    session_id: deliberationSessionId,
    analytics_session_id: cleanText(event?.analyticsSessionId, 120),
    deliberation_session_id: deliberationSessionId,
    release_id: cleanText(event?.releaseId, 80),
    mode: event?.mode === 'kiosk' ? 'kiosk' : 'standard',
    device_class: ['mobile', 'tablet', 'desktop'].includes(event?.deviceClass) ? event.deviceClass : null,
    platform_family: cleanText(event?.platformFamily, 40),
    event_name: eventName,
    properties: cleanProperties(eventName, event?.properties),
    occurred_at: occurredAt,
  };
}

export function artworkReliabilityEvent(result = {}, durationMs = 0) {
  return {
    event: 'artwork_request_completed',
    properties: {
      provider: 'volcengine',
      model: cleanText(result.model, 120) || '',
      success: result.available === true,
      durationMs: Math.max(0, Number(durationMs) || 0),
      retryCount: Math.max(0, Number(result.retryCount) || 0),
      errorCode: result.available === true ? '' : (cleanText(result.reason, 80) || 'unknown'),
    },
  };
}

function asProperties(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

function rate(numerator, denominator) {
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null };
}

function percentile(sorted, percentage) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)];
}

function durationSummary(values) {
  const sorted = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return { average: null, p50: null, p90: null, samples: 0 };
  return {
    average: Math.round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    samples: sorted.length,
  };
}

export function aggregateProductAnalytics(rows = [], options = {}) {
  const fromTime = options.from ? new Date(options.from).getTime() : -Infinity;
  const toTime = options.to ? new Date(options.to).getTime() : Infinity;
  const filtered = rows.filter((row) => {
    const time = new Date(row.occurred_at).getTime();
    return time >= fromTime
      && time <= toTime
      && (!options.mode || row.mode === options.mode)
      && (!options.releaseId || row.release_id === options.releaseId);
  });
  const experienceRows = filtered.filter((row) => !['ops_accessed', 'feedback_reviewed'].includes(row.event_name));
  const visitors = new Set(experienceRows.map((row) => row.user_id).filter(Boolean));
  const visits = new Set(experienceRows.map((row) => row.analytics_session_id).filter(Boolean));
  const started = new Set();
  const completed = new Set();
  const phaseSessions = new Map(FUNNEL_PHASES.map((phase) => [phase, new Set()]));
  const durationBySession = new Map();
  const releases = new Map();
  const reliability = { llmRequests: 0, llmFailures: 0, artworkRequests: 0, artworkFailures: 0, artworkSelections: 0, artworkTemporaryResults: 0, fallbacks: 0, clientErrors: 0 };
  let handoffs = 0;
  let feedback = 0;

  for (const row of filtered) {
    const event = row.event_name;
    const properties = asProperties(row.properties);
    const sessionId = row.deliberation_session_id || row.session_id;
    if (event === 'deliberation_started' && sessionId) started.add(sessionId);
    if (event === 'deliberation_completed' && sessionId) {
      completed.add(sessionId);
      if (Number.isFinite(properties.durationMs) && !durationBySession.has(sessionId)) durationBySession.set(sessionId, properties.durationMs);
    }
    if ((event === 'phase_entered' || event === 'phase_enter') && sessionId && phaseSessions.has(properties.phase)) {
      phaseSessions.get(properties.phase).add(sessionId);
      if (properties.phase === 'final') completed.add(sessionId);
    }
    if (event === 'kiosk_handoff_completed') handoffs += 1;
    if (event === 'feedback_submitted') feedback += 1;
    if (event === 'llm_request_completed' || event === 'llm_result') {
      reliability.llmRequests += 1;
      if (properties.success === false) reliability.llmFailures += 1;
    }
    if (event === 'artwork_request_completed' || event === 'artwork_job_completed') {
      reliability.artworkRequests += 1;
      if (properties.success === false) reliability.artworkFailures += 1;
      if (properties.success === true && properties.persistent === false) reliability.artworkTemporaryResults += 1;
    }
    if (event === 'artwork_version_selected') reliability.artworkSelections += 1;
    if (event === 'fallback_activated') reliability.fallbacks += 1;
    if (event === 'client_error' || event === 'error') reliability.clientErrors += 1;

    const releaseId = row.release_id || 'unknown';
    if (!releases.has(releaseId)) releases.set(releaseId, { releaseId, events: 0, sessions: new Set() });
    const release = releases.get(releaseId);
    release.events += 1;
    if (sessionId) release.sessions.add(sessionId);
  }

  const funnel = FUNNEL_PHASES.map((phase, index) => {
    const sessions = phaseSessions.get(phase).size;
    const previous = index === 0 ? started.size : phaseSessions.get(FUNNEL_PHASES[index - 1]).size;
    return { phase, sessions, conversion: rate(sessions, previous) };
  });

  return {
    visitors: visitors.size,
    visits: visits.size,
    starts: started.size,
    completions: completed.size,
    completionRate: rate(completed.size, started.size),
    durationMs: durationSummary([...durationBySession.values()]),
    funnel,
    handoffs,
    feedback,
    reliability,
    byRelease: [...releases.values()].map((release) => ({
      releaseId: release.releaseId,
      events: release.events,
      sessions: release.sessions.size,
    })),
    totalEvents: filtered.length,
  };
}

export default { aggregateProductAnalytics, artworkReliabilityEvent, normalizeProductEvent };
