/**
 * MemoryAgent（记忆总管，role=system，权限最高）
 *   唯一能写 L3 命格/profile（user_memory） 和 L2 推演摘要（session_summaries）、相关 recall 的入口。
 *   其他模块（planner/deliberationEngine/智囊 Agent）必须通过 MemoryAgent 读写，
 *   不允许再直接 import memoryService.*。
 */
import BaseAgent from '../BaseAgent.js';
import memoryService from '../../services/memoryService.js';
import db from '../../services/db.js';
import logger from '../../services/logger.js';

const SUMMARIES_TABLE = 'session_summaries';

export class MemoryAgent extends BaseAgent {
  constructor() {
    super({
      id: 'memory',
      name: '演·记忆总管',
      role: 'system',
      timeoutMs: 25 * 1000,
      retries: 1
    });
  }

  async _execute(ctx) {
    const bb = ctx.blackboard || {};
    const op = bb.operation;
    if (!op) throw new Error('[MemoryAgent] blackboard.operation 缺失');
    const uid = ctx.userId;
    switch (op) {
      case 'recallProfile': {
        // 返回两条：profileText（格式化后的自然语言，兼容旧 getUserProfile 返回的是 string）+ profileMemories（原始结构化数组）
        const profileText = await memoryService.getUserProfile(uid) || '';
        const memories = await memoryService.listMemories(uid, 20) || [];
        return { profileText, profileMemories: memories };
      }
      case 'writeProfileMemories': {
        // L3 命格：Array<{content, memory_type='profile'|'preference'|'concern', tags[], importance:1~5}>，调用 memoryService.upsertMemory
        const arr = Array.isArray(bb.memories) ? bb.memories : [];
        const written = [];
        for (const m of arr) {
          if (!m || !m.content) continue;
          const memory_type = ['profile','preference','concern'].includes(m.memory_type) ? m.memory_type : 'profile';
          const importance = Number.isFinite(Number(m.importance)) ? Math.min(5, Math.max(1, Number(m.importance))) : 3;
          const tags = Array.isArray(m.tags) ? m.tags.filter(Boolean).slice(0, 5) : [];
          try {
            const id = await memoryService.upsertMemory({
              user_id: uid,
              memory_type,
              content: String(m.content).trim().slice(0, 200),
              importance,
              tags,
            });
            written.push({ id, memory_type, importance });
          } catch (e) {
            logger.warn(`[MemoryAgent] writeProfileMemories 单条失败: ${e.message}`);
          }
        }
        this.audit(3, 'MEMORY_PROFILE_WRITE', `written=${written.length}/${arr.length} types:${written.map(w=>w.memory_type).join(',')}`, ctx);
        return { written };
      }
      case 'writeSummary': {
        const text = String(bb.summaryText || '').trim();
        if (!text) throw new Error('[Memory] writeSummary.summaryText 为空');
        const clamped = text.length > 400 ? text.slice(0, 400) : text;
        const meta = bb.meta || {};
        const summaryId = `sum_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
        await db.query({
          table: SUMMARIES_TABLE,
          action: 'insert',
          data: {
            id: summaryId,
            user_id: uid,
            session_id: ctx.sessionId,
            summary: clamped,
            question: String(meta.question || '').slice(0, 500),
            tags: Array.isArray(meta.tags) ? JSON.stringify(meta.tags.slice(0, 10)) : '[]',
            created_at: new Date().toISOString(),
          },
        });
        return { id: summaryId, summary: clamped };
      }
      case 'recallRelated': {
        const question = String(bb.question || '');
        const k = Math.max(1, Math.min(10, Number(bb.k) || 3));
        // 先从 recall (向量+关键词) 拿，fallback 用 recentSummaries 关键词排序
        let scored = [];
        try {
          const recalled = await memoryService.recall(uid, question, k * 2) || [];
          // 召回时 memory 条目本身有 score；加上自己 sessionId 过滤
          scored = (Array.isArray(recalled) ? recalled : []).slice(0, k).map(r => ({
            id: r.id || r.memory_id || `mem_${Math.random().toString(36).slice(2,8)}`,
            type: r.memory_type || 'memory',
            content: r.content || '',
            score: Number.isFinite(Number(r.score)) ? Number(r.score) : 0.5,
            sessionId: r.session_id || '',
          }));
        } catch (e) {
          logger.warn(`[MemoryAgent] recall 失败, 用 recentSummaries 兜底: ${e.message}`);
        }
        if (scored.length === 0) {
          const recent = (await memoryService.recentSummaries(uid, 30)) || [];
          const tokens = question.toLowerCase().split(/[\s,，。？！；：、.!?\n]+/).filter(s => s.length >= 2);
          const tmp = recent
            .map(s => {
              const text = ((s.summary || '') + ' ' + (s.question || '')).toLowerCase();
              let score = 0;
              for (const t of tokens) if (text.includes(t)) score++;
              score /= Math.max(1, tokens.length);
              if (s.session_id === ctx.sessionId) score = -1;
              return { s, score };
            })
            .sort((a, b) => b.score - a.score)
            .filter(x => x.score > 0)
            .slice(0, k);
          scored = tmp.map(x => ({
            id: x.s.id, type: 'summary',
            content: x.s.summary || '',
            question: x.s.question || '',
            score: x.score,
            sessionId: x.s.session_id || ''
          }));
        }
        // 命格相关：从 listMemories 找关键词命中
        const profileMemories = await memoryService.listMemories(uid, 30) || [];
        const tokens = question.toLowerCase().split(/[\s,，。？！；：、.!?\n]+/).filter(s => s.length >= 2);
        const relatedProfile = [];
        for (const m of profileMemories) {
          const txt = `${m.content || ''} ${(m.tags || []).join(' ')}`.toLowerCase();
          let hit = 0;
          for (const t of tokens) if (txt.includes(t)) hit++;
          if (hit > 0 || !tokens.length) relatedProfile.push({ id: m.id, type: m.memory_type, content: m.content || '', importance: Number(m.importance) || 3, hit });
        }
        relatedProfile.sort((a, b) => (b.importance || 0) - (a.importance || 0) || (b.hit || 0) - (a.hit || 0));
        return { related: scored.slice(0, k), relatedProfile: relatedProfile.slice(0, 5) };
      }
      default:
        throw new Error(`[Memory] unknown operation: ${op}`);
    }
  }
}

export default MemoryAgent;
