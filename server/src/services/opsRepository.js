import { pool, query } from './db.js';

export function normalizeOpsRange(queryParams = {}, now = Date.now()) {
  const requestedDays = Number.parseInt(queryParams.days, 10);
  const days = Number.isFinite(requestedDays) ? Math.min(90, Math.max(1, requestedDays)) : 7;
  return {
    days,
    from: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(),
    to: new Date(now).toISOString(),
    mode: queryParams.mode === 'kiosk' || queryParams.mode === 'standard' ? queryParams.mode : '',
    releaseId: String(queryParams.releaseId || '').trim().slice(0, 80),
  };
}

export async function loadProductEvents(range) {
  if (pool) {
    const values = [range.from, range.to];
    const clauses = ['occurred_at >= $1', 'occurred_at <= $2'];
    if (range.mode) { values.push(range.mode); clauses.push(`mode = $${values.length}`); }
    if (range.releaseId) { values.push(range.releaseId); clauses.push(`release_id = $${values.length}`); }
    const result = await pool.query(`SELECT * FROM product_events WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC`, values);
    return result.rows;
  }
  const result = await query({ table: 'product_events', action: 'select', filter: {}, queryOptions: { orderBy: 'occurred_at:desc' } });
  return result.rows.filter((row) => {
    const time = new Date(row.occurred_at).getTime();
    return time >= new Date(range.from).getTime()
      && time <= new Date(range.to).getTime()
      && (!range.mode || row.mode === range.mode)
      && (!range.releaseId || row.release_id === range.releaseId);
  });
}

export async function loadFeedback(range, limit = 100) {
  const safeLimit = Math.min(100, Math.max(1, limit));
  if (pool) {
    const values = [range.from, range.to];
    const clauses = ['created_at >= $1', 'created_at <= $2'];
    if (range.mode) { values.push(range.mode); clauses.push(`mode = $${values.length}`); }
    if (range.releaseId) { values.push(range.releaseId); clauses.push(`release_id = $${values.length}`); }
    values.push(safeLimit);
    const result = await pool.query(`SELECT * FROM product_feedback WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length}`, values);
    return result.rows;
  }
  const result = await query({ table: 'product_feedback', action: 'select', filter: {}, queryOptions: { orderBy: 'created_at:desc' } });
  return result.rows.filter((row) => {
    const time = new Date(row.created_at).getTime();
    return time >= new Date(range.from).getTime()
      && time <= new Date(range.to).getTime()
      && (!range.mode || row.mode === range.mode)
      && (!range.releaseId || row.release_id === range.releaseId);
  }).slice(0, safeLimit);
}

export async function updateFeedbackReview(id, updates) {
  return (await query({ table: 'product_feedback', action: 'update', id, data: updates })).rows[0] || null;
}

export default { loadFeedback, loadProductEvents, normalizeOpsRange, updateFeedbackReview };
