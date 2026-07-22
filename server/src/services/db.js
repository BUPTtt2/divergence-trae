import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrations.js';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

/**
 * PostgreSQL 连接池
 * 如果 DATABASE_URL 未配置，降级到内存存储（Map），用 JSON 文件持久化
 * 这样即使没数据库也能跑
 */

let pool = null;
let useMemory = false;

// 内存存储：按表名分组的 Map
const memoryStore = new Map();
// 持久化文件路径
const PERSIST_FILE = path.join(__dirname, '..', '..', '.memory-db.json');

/**
 * 加载持久化的内存数据
 */
function loadMemoryStore() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = fs.readFileSync(PERSIST_FILE, 'utf-8');
      const data = JSON.parse(raw);
      for (const [table, rows] of Object.entries(data)) {
        memoryStore.set(table, new Map(rows));
      }
    }
  } catch (e) {
    console.warn('[DB] 加载内存持久化文件失败，使用空存储:', e.message);
  }
}

/**
 * 保存内存数据到文件
 */
function persistMemoryStore() {
  try {
    const data = {};
    for (const [table, map] of memoryStore.entries()) {
      data[table] = Array.from(map.entries());
    }
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[DB] 持久化内存数据失败:', e.message);
  }
}

/**
 * 初始化数据库连接
 */
export function initDB() {
  if (DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        ssl: DATABASE_URL.includes('railway') || DATABASE_URL.includes('supabase')
          ? { rejectUnauthorized: false }
          : undefined,
      });
      console.log('[DB] 使用 PostgreSQL 连接池');
      return pool;
    } catch (e) {
      console.warn('[DB] PostgreSQL 连接失败，降级到内存存储:', e.message);
      pool = null;
    }
  }

  useMemory = true;
  loadMemoryStore();
  console.log('[DB] 使用内存存储模式（无 DATABASE_URL）');
  return null;
}

/**
 * 执行 SQL 查询（PostgreSQL 模式）
 * @param {string} text SQL 语句
 * @param {Array} params 参数
 * @returns {Promise<{rows: Array, rowCount: number}>}
 */
async function pgQuery(text, params = []) {
  if (!pool) throw new Error('数据库未初始化');
  const result = await pool.query(text, params);
  return { rows: result.rows, rowCount: result.rowCount };
}

// ============================================================
// 内存存储模式下的简易 ORM 操作
// ============================================================

/**
 * 获取或创建表
 */
function getTable(name) {
  if (!memoryStore.has(name)) {
    memoryStore.set(name, new Map());
  }
  return memoryStore.get(name);
}

/**
 * 内存模式：插入记录
 */
function memInsert(table, data) {
  const t = getTable(table);
  const id = data.id || String(Date.now()) + Math.random().toString(36).slice(2, 6);
  const record = { ...data, id, created_at: data.created_at || new Date().toISOString() };
  t.set(id, record);
  persistMemoryStore();
  return { rows: [record], rowCount: 1 };
}

/**
 * 内存模式：查询记录
 * @param {string} table 表名
 * @param {object} filter 过滤条件 { field: value }
 * @param {object} options { orderBy, limit }
 */
function memSelect(table, filter = {}, options = {}) {
  const t = getTable(table);
  let rows = Array.from(t.values());

  // 过滤
  for (const [key, value] of Object.entries(filter)) {
    if (value !== undefined && value !== null) {
      rows = rows.filter((r) => r[key] === value);
    }
  }

  // 排序
  if (options.orderBy) {
    const [field, dir] = options.orderBy.split(':');
    rows.sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'desc' ? vb - va : va - vb;
      }
      const sa = String(va || '');
      const sb = String(vb || '');
      return dir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb);
    });
  }

  // 限制
  if (options.limit) {
    rows = rows.slice(0, options.limit);
  }

  return { rows, rowCount: rows.length };
}

/**
 * 内存模式：更新记录
 */
function memUpdate(table, id, data) {
  const t = getTable(table);
  const existing = t.get(id);
  if (!existing) return { rows: [], rowCount: 0 };
  const updated = { ...existing, ...data, updated_at: new Date().toISOString() };
  t.set(id, updated);
  persistMemoryStore();
  return { rows: [updated], rowCount: 1 };
}

/**
 * 内存模式：删除记录
 */
function memDelete(table, id) {
  const t = getTable(table);
  const existed = t.has(id);
  t.delete(id);
  persistMemoryStore();
  return { rows: [], rowCount: existed ? 1 : 0 };
}

/**
 * 统一查询接口
 * PostgreSQL 模式：执行 SQL
 * 内存模式：执行简单 CRUD 操作
 *
 * @param {object} options
 * @param {string} options.table 表名（内存模式必填）
 * @param {string} options.sql SQL 语句（PostgreSQL 模式）
 * @param {Array} options.params SQL 参数
 * @param {string} options.action 操作类型: 'insert'|'select'|'update'|'delete'|'raw'
 * @param {object} options.data 插入/更新的数据
 * @param {object} options.filter 查询过滤条件
 * @param {object} options.queryOptions 排序/限制
 * @param {string} options.id 记录 ID
 */
export async function query(options) {
  // PostgreSQL 模式
  if (!useMemory && pool) {
    if (options.sql) {
      return pgQuery(options.sql, options.params || []);
    }
    // 根据操作类型构建 SQL
    const { table, action, data, filter, queryOptions, id } = options;

    // 表名白名单校验
    const ALLOWED_TABLES = ['users', 'refresh_tokens', 'cards', 'community_posts', 'community_replies', 'community_likes', 'achievements', 'user_memories', 'conversations', 'conversation_messages', 'custom_advisors', 'daily_divinations', 'user_levels', 'decision_follow_ups', 'inference_sessions'];
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(`非法表名: ${table}`);
    }

    // 字段名格式校验（只允许字母、数字、下划线）
    const validFieldName = (name) => /^[a-z_][a-z0-9_]*$/i.test(name);

    if (action === 'insert' && data) {
      const keys = Object.keys(data);
      if (!keys.every(validFieldName)) throw new Error('非法字段名');
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      return pgQuery(sql, values);
    }
    if (action === 'select') {
      const filterKeys = filter ? Object.keys(filter).filter((k) => filter[k] !== undefined && filter[k] !== null) : [];
      if (!filterKeys.every(validFieldName)) throw new Error('非法字段名');
      const where = filterKeys.length > 0
        ? 'WHERE ' + filterKeys.map((k, i) => `${k} = $${i + 1}`).join(' AND ')
        : '';
      const params = filterKeys.map((k) => filter[k]);
      let sql = `SELECT * FROM ${table} ${where}`;
      if (queryOptions?.orderBy) {
        const [field, dir] = queryOptions.orderBy.split(':');
        if (!validFieldName(field)) throw new Error('非法排序字段名');
        sql += ` ORDER BY ${field} ${dir === 'desc' ? 'DESC' : 'ASC'}`;
      }
      if (queryOptions?.limit) {
        const lim = parseInt(queryOptions.limit, 10);
        if (lim > 0 && lim <= 200) sql += ` LIMIT ${lim}`;
      }
      return pgQuery(sql, params);
    }
    if (action === 'update' && id && data) {
      const keys = Object.keys(data);
      if (!keys.every(validFieldName)) throw new Error('非法字段名');
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`;
      return pgQuery(sql, [...Object.values(data), id]);
    }
    if (action === 'delete' && id) {
      return pgQuery(`DELETE FROM ${table} WHERE id = $1`, [id]);
    }
    throw new Error('不支持的数据库操作');
  }

  // 内存模式
  const { table, action, data, filter, queryOptions, id } = options;
  switch (action) {
    case 'insert':
      return memInsert(table, data);
    case 'select':
      return memSelect(table, filter || {}, queryOptions || {});
    case 'update':
      return memUpdate(table, id, data);
    case 'delete':
      return memDelete(table, id);
    case 'raw':
      // 内存模式不支持 raw SQL，返回空
      return { rows: [], rowCount: 0 };
    default:
      throw new Error(`不支持的内存操作: ${action}`);
  }
}

/**
 * 创建数据库表（仅 PostgreSQL 模式）
 * 使用 CREATE TABLE IF NOT EXISTS，安全可重复执行
 */
export async function ensureSchema() {
  if (!pool) return;
  await runMigrations(pool);
  const indexStatements = [
    `CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_posts_created_at ON community_posts(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_replies_post_id ON community_replies(post_id)`,
    `CREATE INDEX IF NOT EXISTS idx_achievements_user_id ON achievements(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_memories_user_id ON user_memories(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_memories_type ON user_memories(type)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON conversation_messages(conversation_id)`,
    `CREATE INDEX IF NOT EXISTS idx_daily_user_date ON daily_divinations(user_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_custom_advisors_user ON custom_advisors(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_followups_user_status ON decision_follow_ups(user_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_followups_date ON decision_follow_ups(follow_up_date)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_status ON inference_sessions(user_id, status)`,
  ];
  for (const sql of indexStatements) {
    try {
      await pool.query(sql);
    } catch (e) {
      console.warn('[DB] 创建索引失败:', e.message);
    }
  }
  console.log('[DB] Schema 初始化完成');
}

/**
 * 关闭数据库连接
 */
export async function closeDB() {
  if (pool) {
    await pool.end();
    console.log('[DB] PostgreSQL 连接池已关闭');
  }
}

export { useMemory, pool };
export default { query, initDB, closeDB };
