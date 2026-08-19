import { query } from './db.js';

const PROFILE_FIELDS = Object.freeze([
  'id',
  'email',
  'nickname',
  'avatar',
  'color',
  'bio',
  'realm',
  'level',
  'xp',
  'streak_days',
  'email_verified_at',
  'created_at',
  'updated_at',
]);

const USER_TABLES = Object.freeze([
  'cards',
  'achievements',
  'user_memories',
  'conversations',
  'custom_advisors',
  'advisor_subscriptions',
  'daily_divinations',
  'user_levels',
  'decision_follow_ups',
  'community_posts',
  'community_replies',
  'community_likes',
  'product_events',
  'product_feedback',
  'inference_sessions',
  'llm_usage_events',
  'deliberation_sessions',
  'session_summaries',
  'user_memory',
  'artwork_jobs',
  'artwork_versions',
  'entitlement_accounts',
  'entitlement_ledger',
  'payment_events',
  'session_eval',
  'deliberation_commands',
]);

const ALTERNATE_OWNER_TABLES = Object.freeze([
  ['published_advisors', 'owner_user_id'],
  ['community_reports', 'reporter_user_id'],
  ['shared_agents', 'creator_id'],
]);

const FORBIDDEN_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'token_hash',
  'refresh_token',
  'access_token',
  'api_key',
  'secret',
]);

function pick(source, fields) {
  return Object.fromEntries(fields
    .filter((field) => source[field] !== undefined)
    .map((field) => [field, source[field]]));
}

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !FORBIDDEN_KEYS.has(key.toLowerCase()))
    .map(([key, child]) => [key, scrub(child)]));
}

export async function exportAccountData(userId, options = {}) {
  const queryImpl = options.queryImpl || query;
  const now = options.now || Date.now;
  const profileResult = await queryImpl({
    table: 'users',
    action: 'select',
    filter: { id: userId },
    queryOptions: { limit: 1 },
  });
  const user = profileResult.rows[0];
  if (!user || user.anonymous) {
    const error = new Error('Registered account required');
    error.code = 'REGISTERED_ACCOUNT_REQUIRED';
    throw error;
  }

  const entries = await Promise.all(USER_TABLES.map(async (table) => {
    const result = await queryImpl({ table, action: 'select', filter: { user_id: userId } });
    return [table, scrub(result.rows)];
  }));
  const alternateEntries = await Promise.all(ALTERNATE_OWNER_TABLES.map(async ([table, ownerField]) => {
    const result = await queryImpl({ table, action: 'select', filter: { [ownerField]: userId } });
    return [table, scrub(result.rows)];
  }));

  return {
    schemaVersion: 1,
    exportedAt: new Date(now()).toISOString(),
    profile: pick(user, PROFILE_FIELDS),
    data: Object.fromEntries([...entries, ...alternateEntries]),
  };
}

export default exportAccountData;
