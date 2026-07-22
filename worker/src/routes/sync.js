/**
 * 数据同步路由
 * - 全部需要 authMiddleware
 * - migrate: 合并 localStorage 数据到云端（去重）
 * - export: 导出当前用户全部数据
 * - import: 覆盖式导入（需 overwrite=true）
 * - status: 同步状态统计
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.js';
import { errors } from '../middleware/error.js';
import { uuid, now, today, audit } from '../utils/id.js';

const app = new Hono();

app.use('*', authMiddleware);

// ============================================================
// POST /migrate — 合并 localStorage 数据
// ============================================================

app.post('/migrate', async (c) => {
  try {
    const userId = c.get('userId');
    const body = await c.req.json().catch(() => ({}));
    const data = body.data || body;

    const migrated = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0,
    };
    const skipped = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0,
    };

    const ts = now();

    // 自定义智囊 — 按 name+persona 去重
    if (Array.isArray(data.custom_advisors)) {
      for (const a of data.custom_advisors) {
        if (!a.name || !a.persona) {
          skipped.advisors++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM custom_advisors WHERE user_id = ? AND name = ? AND persona = ?`
        )
          .bind(userId, a.name, a.persona)
          .first();
        if (dup) {
          skipped.advisors++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO custom_advisors
           (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            uuid(),
            userId,
            a.name,
            a.persona,
            a.perspective || '',
            a.style || '周易古风',
            a.element || null,
            a.trigram || null,
            a.color || null,
            a.origin_market_id || null
          )
          .run();
        migrated.advisors++;
      }
    }

    // 命签 — 按 question+gua+时间戳接近去重
    if (Array.isArray(data.cards)) {
      for (const card of data.cards) {
        if (!card.question) {
          skipped.cards++;
          continue;
        }
        // 同 question + gua 且创建时间在 5 分钟内视为重复
        const created = card.created_at || ts;
        const since = new Date(created);
        since.setMinutes(since.getMinutes() - 5);
        const sinceStr = since.toISOString();
        const until = new Date(created);
        until.setMinutes(until.getMinutes() + 5);
        const untilStr = until.toISOString();

        const dup = await c.env.DB.prepare(
          `SELECT id FROM cards
           WHERE user_id = ? AND question = ? AND gua IS ?
             AND created_at BETWEEN ? AND ?`
        )
          .bind(
            userId,
            card.question,
            card.gua || null,
            sinceStr,
            untilStr
          )
          .first();
        if (dup) {
          skipped.cards++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO cards
           (id, user_id, session_id, gua, trigram, element, title, question, decision,
            verse, summary, advisors, rarity, style, pillars, powerful_question, framework, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            uuid(),
            userId,
            card.session_id || null,
            card.gua || null,
            card.trigram || null,
            card.element || null,
            card.title || null,
            card.question,
            card.decision || null,
            card.verse || null,
            card.summary || null,
            typeof card.advisors === 'string' ? card.advisors : JSON.stringify(card.advisors || []),
            card.rarity || null,
            card.style || null,
            typeof card.pillars === 'string' ? card.pillars : JSON.stringify(card.pillars || null),
            card.powerful_question || null,
            card.framework || null,
            card.is_shared ? 1 : 0
          )
          .run();
        migrated.cards++;
      }
    }

    // 每日卦签 — UNIQUE(user_id, date) 自动去重
    if (Array.isArray(data.daily_divinations)) {
      for (const d of data.daily_divinations) {
        if (!d.date) {
          skipped.daily++;
          continue;
        }
        try {
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO daily_divinations
             (id, user_id, date, gua, verse, message)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
            .bind(uuid(), userId, d.date, d.gua || null, d.verse || null, d.message || null)
            .run();
          // 无法直接拿到 affected rows，简化：标记为 migrated
          migrated.daily++;
        } catch {
          skipped.daily++;
        }
      }
    }

    // 用户记忆 — 按 category+title+content 去重
    if (Array.isArray(data.user_memories)) {
      for (const m of data.user_memories) {
        if (!m.category || !m.content) {
          skipped.memories++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM user_memories
           WHERE user_id = ? AND category = ? AND title IS ? AND content = ?`
        )
          .bind(userId, m.category, m.title || null, m.content)
          .first();
        if (dup) {
          skipped.memories++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO user_memories
           (id, user_id, category, title, content, source, confidence)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            uuid(),
            userId,
            m.category,
            m.title || null,
            m.content,
            m.source || null,
            typeof m.confidence === 'number' ? m.confidence : 0.8
          )
          .run();
        migrated.memories++;
      }
    }

    // 成就 — UNIQUE(user_id, achievement_id) 自动去重
    if (Array.isArray(data.achievements)) {
      for (const a of data.achievements) {
        if (!a.achievement_id) {
          skipped.achievements++;
          continue;
        }
        try {
          await c.env.DB.prepare(
            `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id)
             VALUES (?, ?, ?)`
          )
            .bind(uuid(), userId, a.achievement_id)
            .run();
          migrated.achievements++;
        } catch {
          skipped.achievements++;
        }
      }
    }

    // 决策回访 — 按 question+decision+follow_up_date 去重
    if (Array.isArray(data.decision_follow_ups)) {
      for (const f of data.decision_follow_ups) {
        if (!f.question || !f.decision || !f.follow_up_date) {
          skipped.followups++;
          continue;
        }
        const dup = await c.env.DB.prepare(
          `SELECT id FROM decision_follow_ups
           WHERE user_id = ? AND question = ? AND decision = ? AND follow_up_date = ?`
        )
          .bind(userId, f.question, f.decision, f.follow_up_date)
          .first();
        if (dup) {
          skipped.followups++;
          continue;
        }
        await c.env.DB.prepare(
          `INSERT INTO decision_follow_ups
           (id, user_id, card_id, question, decision, follow_up_date, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            uuid(),
            userId,
            f.card_id || null,
            f.question,
            f.decision,
            f.follow_up_date,
            f.status || 'pending'
          )
          .run();
        migrated.followups++;
      }
    }

    await audit(c, 'sync_migrate', 'user', userId, migrated);

    return c.json({
      success: true,
      migrated,
      skipped,
      syncedAt: ts,
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /export — 导出当前用户所有数据
// ============================================================

app.get('/export', async (c) => {
  try {
    const userId = c.get('userId');

    const [user, advisors, cards, daily, memories, achievements, followups, convs] =
      await Promise.all([
        c.env.DB.prepare(
          'SELECT id, nickname, avatar, color, bio, realm, level, xp, streak_days, total_inferences, total_chats, created_at FROM users WHERE id = ?'
        )
          .bind(userId)
          .first(),
        c.env.DB.prepare('SELECT * FROM custom_advisors WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT * FROM cards WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT * FROM daily_divinations WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT * FROM user_memories WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT * FROM decision_follow_ups WHERE user_id = ?')
          .bind(userId)
          .all(),
        c.env.DB.prepare('SELECT id, title, created_at, last_message_at FROM conversations WHERE user_id = ?')
          .bind(userId)
          .all(),
      ]);

    return c.json({
      exportedAt: now(),
      version: '1.0.0',
      user,
      custom_advisors: advisors.results,
      cards: cards.results,
      daily_divinations: daily.results,
      user_memories: memories.results,
      achievements: achievements.results,
      decision_follow_ups: followups.results,
      conversations: convs.results,
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

// ============================================================
// POST /import — 覆盖式导入（需 overwrite=true）
// ============================================================

app.post('/import', async (c) => {
  try {
    const userId = c.get('userId');
    const overwrite = c.req.query('overwrite') === 'true';
    if (!overwrite)
      throw errors.badRequest('覆盖式导入需确认 overwrite=true');

    const body = await c.req.json().catch(() => ({}));
    const data = body.data || body;

    // 清空旧数据（保留用户主表）
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM custom_advisors WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM cards WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM daily_divinations WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM user_memories WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM achievements WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM decision_follow_ups WHERE user_id = ?').bind(userId),
    ]);

    // 复用 migrate 逻辑：构造一个临时 stub 数据并批量插入
    // 简化实现 — 调用同样的合并代码（清空后 insert 几乎不会触发去重跳过）
    const migrated = {
      advisors: 0,
      cards: 0,
      daily: 0,
      memories: 0,
      achievements: 0,
      followups: 0,
    };

    if (Array.isArray(data.custom_advisors)) {
      for (const a of data.custom_advisors) {
        if (!a.name || !a.persona) continue;
        await c.env.DB.prepare(
          `INSERT INTO custom_advisors (id, user_id, name, persona, perspective, style, element, trigram, color, origin_market_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid(), userId, a.name, a.persona, a.perspective || '', a.style || '周易古风', a.element || null, a.trigram || null, a.color || null, a.origin_market_id || null)
          .run();
        migrated.advisors++;
      }
    }

    if (Array.isArray(data.cards)) {
      for (const card of data.cards) {
        if (!card.question) continue;
        await c.env.DB.prepare(
          `INSERT INTO cards (id, user_id, gua, trigram, element, title, question, decision, verse, summary, is_shared)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid(), userId, card.gua || null, card.trigram || null, card.element || null, card.title || null, card.question, card.decision || null, card.verse || null, card.summary || null, card.is_shared ? 1 : 0)
          .run();
        migrated.cards++;
      }
    }

    if (Array.isArray(data.daily_divinations)) {
      for (const d of data.daily_divinations) {
        if (!d.date) continue;
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO daily_divinations (id, user_id, date, gua, verse, message) VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid(), userId, d.date, d.gua || null, d.verse || null, d.message || null)
          .run();
        migrated.daily++;
      }
    }

    if (Array.isArray(data.user_memories)) {
      for (const m of data.user_memories) {
        if (!m.category || !m.content) continue;
        await c.env.DB.prepare(
          `INSERT INTO user_memories (id, user_id, category, title, content, source, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid(), userId, m.category, m.title || null, m.content, m.source || null, typeof m.confidence === 'number' ? m.confidence : 0.8)
          .run();
        migrated.memories++;
      }
    }

    if (Array.isArray(data.achievements)) {
      for (const a of data.achievements) {
        if (!a.achievement_id) continue;
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO achievements (id, user_id, achievement_id) VALUES (?, ?, ?)`
        )
          .bind(uuid(), userId, a.achievement_id)
          .run();
        migrated.achievements++;
      }
    }

    if (Array.isArray(data.decision_follow_ups)) {
      for (const f of data.decision_follow_ups) {
        if (!f.question || !f.decision || !f.follow_up_date) continue;
        await c.env.DB.prepare(
          `INSERT INTO decision_follow_ups (id, user_id, card_id, question, decision, follow_up_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(uuid(), userId, f.card_id || null, f.question, f.decision, f.follow_up_date, f.status || 'pending')
          .run();
        migrated.followups++;
      }
    }

    await audit(c, 'sync_import_overwrite', 'user', userId, migrated);

    return c.json({
      success: true,
      imported: migrated,
      importedAt: now(),
    });
  } catch (e) {
    if (e.status) throw e;
    throw errors.internal(e.message);
  }
});

// ============================================================
// GET /status — 同步状态统计
// ============================================================

app.get('/status', async (c) => {
  try {
    const userId = c.get('userId');

    const [
      advisorsR,
      cardsR,
      dailyR,
      memoriesR,
      achievementsR,
      followupsR,
      convsR,
      lastAuditR,
    ] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) as n FROM custom_advisors WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM cards WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM daily_divinations WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM user_memories WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM achievements WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM decision_follow_ups WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare('SELECT COUNT(*) as n FROM conversations WHERE user_id = ?').bind(userId).first(),
      c.env.DB.prepare(
        `SELECT created_at FROM audit_logs WHERE user_id = ? AND action IN ('sync_migrate','sync_import_overwrite') ORDER BY created_at DESC LIMIT 1`
      )
        .bind(userId)
        .first(),
    ]);

    return c.json({
      lastSyncedAt: lastAuditR?.created_at || null,
      today: today(),
      counts: {
        advisors: advisorsR?.n || 0,
        cards: cardsR?.n || 0,
        daily: dailyR?.n || 0,
        memories: memoriesR?.n || 0,
        achievements: achievementsR?.n || 0,
        followups: followupsR?.n || 0,
        conversations: convsR?.n || 0,
      },
    });
  } catch (e) {
    throw errors.internal(e.message);
  }
});

export default app;
