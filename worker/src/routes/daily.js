/**
 * 每日卦签路由
 * - 全部需要 authMiddleware
 * - 同一天同用户得到同一卦（基于 user_id + date 哈希）
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, today, parsePagination } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

// ============================================================
// 卦象数据（64卦精简版，索引 0-63）
// ============================================================

const GUA_LIST = [
  { gua: '乾', verse: '元亨利贞', trigram: '乾上乾下', element: '金' },
  { gua: '坤', verse: '元亨，利牝马之贞', trigram: '坤上坤下', element: '土' },
  { gua: '屯', verse: '元亨利贞，勿用有攸往', trigram: '坎上震下', element: '水' },
  { gua: '蒙', verse: '亨。匪我求童蒙', trigram: '艮上坎下', element: '土' },
  { gua: '需', verse: '有孚，光亨，贞吉', trigram: '坎上乾下', element: '水' },
  { gua: '讼', verse: '有孚，窒。惕中吉', trigram: '乾上坎下', element: '金' },
  { gua: '师', verse: '贞，丈人吉无咎', trigram: '坤上坎下', element: '土' },
  { gua: '比', verse: '吉。原筮元永贞', trigram: '坎上坤下', element: '水' },
  { gua: '小畜', verse: '亨。密云不雨', trigram: '巽上乾下', element: '木' },
  { gua: '履', verse: '履虎尾，不咥人，亨', trigram: '乾上兑下', element: '金' },
  { gua: '泰', verse: '小往大来，吉亨', trigram: '坤上乾下', element: '土' },
  { gua: '否', verse: '否之匪人，不利君子贞', trigram: '乾上坤下', element: '金' },
  { gua: '同人', verse: '同人于野，亨', trigram: '乾上离下', element: '金' },
  { gua: '大有', verse: '元亨', trigram: '离上乾下', element: '火' },
  { gua: '谦', verse: '亨，君子有终', trigram: '坤上艮下', element: '土' },
  { gua: '豫', verse: '利建侯行师', trigram: '震上坤下', element: '木' },
];

const DAILY_MESSAGES = [
  '今日宜静观其变，待时而动。',
  '机缘已现，可稳步推进。',
  '事宜缓图，不宜急进。',
  '心正则事顺，守持中道。',
  '小事可成，大事待时。',
  '变动之中藏机锋，宜审慎。',
  '今日有贵人在侧，可问可谋。',
  '宜独思，不宜群议。',
];

/**
 * 用 user_id + date 哈希得到固定一卦
 */
async function hashToGua(userId, date) {
  const data = new TextEncoder().encode(`${userId}:${date}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  // 取前 8 字节为整数
  let n = 0;
  for (let i = 0; i < 8; i++) {
    n = (n * 256 + bytes[i]) % 1000003; // 大素数取模防溢出
  }
  const guaIdx = n % GUA_LIST.length;
  const msgIdx = (n >> 4) % DAILY_MESSAGES.length;
  return { ...GUA_LIST[guaIdx], message: DAILY_MESSAGES[msgIdx] };
}

// ============================================================
// GET / — 当天卦签，没有则生成并存入
// ============================================================

app.get('/', async (c) => {
  try {
    const userId = c.get('userId');
    const date = c.req.query('date') || today();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
      throw errors.badRequest('date 格式应为 YYYY-MM-DD');

    // 已存在则直接返回
    const existing = await c.env.DB.prepare(
      'SELECT * FROM daily_divinations WHERE user_id = ? AND date = ?'
    )
      .bind(userId, date)
      .first();
    if (existing) return c.json(existing);

    // 生成新卦签
    const g = await hashToGua(userId, date);
    const id = uuid();
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO daily_divinations
       (id, user_id, date, gua, verse, message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(id, userId, date, g.gua, g.verse, g.message)
      .run();

    // 同步写日历事件
    await c.env.DB.prepare(
      `INSERT INTO calendar_events (id, user_id, date, type, ref_id, title)
       VALUES (?, ?, ?, 'daily', ?, ?)`
    )
      .bind(uuid(), userId, date, id, `每日卦签 · ${g.gua}`)
      .run()
      .catch(() => {});

    return c.json({ id, user_id: userId, date, ...g });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /history — 当前用户历史每日卦签列表
// ============================================================

app.get('/history', async (c) => {
  try {
    const userId = c.get('userId');
    const { page, pageSize, offset } = parsePagination(c);

    const countRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM daily_divinations WHERE user_id = ?'
    )
      .bind(userId)
      .first();

    const list = await c.env.DB.prepare(
      `SELECT * FROM daily_divinations
       WHERE user_id = ?
       ORDER BY date DESC
       LIMIT ? OFFSET ?`
    )
      .bind(userId, pageSize, offset)
      .all();

    return c.json({
      items: list.results,
      total: countRow?.total || 0,
      page,
      pageSize,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /calendar — 按月查询日历事件（合并多源）
// ============================================================

app.get('/calendar', async (c) => {
  try {
    const userId = c.get('userId');
    const month = c.req.query('month'); // YYYY-MM
    const year = c.req.query('year');
    const m = c.req.query('m');

    // 支持 month=YYYY-MM 或 year=YYYY&m=MM
    let ymPrefix;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      ymPrefix = month;
    } else if (year && m) {
      ymPrefix = `${year}-${String(m).padStart(2, '0')}`;
    } else {
      ymPrefix = today().slice(0, 7);
    }

    const start = `${ymPrefix}-01`;
    const end = `${ymPrefix}-31`;

    // 并行查询三个源
    const [calRes, sessRes, dailyRes] = await Promise.all([
      c.env.DB.prepare(
        `SELECT id, date, type, ref_id, title, created_at
         FROM calendar_events
         WHERE user_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`
      )
        .bind(userId, start, end)
        .all(),
      c.env.DB.prepare(
        `SELECT id, date(created_at) as date, question, status, 'inference' as type
         FROM inference_sessions
         WHERE user_id = ? AND date(created_at) BETWEEN ? AND ?
         ORDER BY created_at ASC`
      )
        .bind(userId, start, end)
        .all(),
      c.env.DB.prepare(
        `SELECT id, date, gua, verse, message, 'daily' as type
         FROM daily_divinations
         WHERE user_id = ? AND date BETWEEN ? AND ?
         ORDER BY date ASC`
      )
        .bind(userId, start, end)
        .all(),
    ]);

    // 合并：按日期分组
    const byDate = {};
    const push = (date, item) => {
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(item);
    };
    for (const r of calRes.results) push(r.date, r);
    for (const r of sessRes.results) push(r.date, r);
    for (const r of dailyRes.results) push(r.date, r);

    return c.json({ month: ymPrefix, items: byDate });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

export default app;
