import { query } from './db.js';

const TABLE = 'decision_follow_ups';

function generateId() {
  return 'fu_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getDateString(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return getDateString(date);
}

export async function scheduleFollowUp(userId, cardId, question, decision, daysLater = 7) {
  const today = getDateString(new Date());
  const followUpDate = addDays(today, daysLater);

  const result = await query({
    table: TABLE,
    action: 'insert',
    data: {
      id: generateId(),
      user_id: userId,
      card_id: cardId || null,
      question: question || '',
      decision: decision || '',
      follow_up_date: followUpDate,
      status: 'pending',
      result_note: null,
    },
  });

  return result.rows[0];
}

export async function getPendingFollowUps(userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId, status: 'pending' },
    queryOptions: { orderBy: 'follow_up_date:asc' },
  });

  return result.rows;
}

export async function completeFollowUp(followUpId, resultNote) {
  const result = await query({
    table: TABLE,
    action: 'update',
    id: followUpId,
    data: {
      status: 'completed',
      result_note: resultNote || '',
    },
  });

  return result.rows[0] || null;
}

export async function checkAndNotify(userId) {
  const today = getDateString(new Date());
  const pending = await getPendingFollowUps(userId);

  const dueToday = pending.filter((item) => item.follow_up_date <= today);

  return {
    hasDueToday: dueToday.length > 0,
    dueCount: dueToday.length,
    dueItems: dueToday,
    totalPending: pending.length,
  };
}

export async function getAllFollowUps(userId) {
  const result = await query({
    table: TABLE,
    action: 'select',
    filter: { user_id: userId },
    queryOptions: { orderBy: 'created_at:desc' },
  });

  return result.rows;
}

export default {
  scheduleFollowUp,
  getPendingFollowUps,
  completeFollowUp,
  checkAndNotify,
  getAllFollowUps,
};
