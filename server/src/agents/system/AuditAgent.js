/**
 * AuditAgent（审查总管，role=system）
 *   订阅 eventBus 所有事件，对每个业务输出做 SEV1/2/3 分级审查，
 *   落盘 audit.jsonl（append-only），并经 EventBus 写入内部审计事件，
 *   前端顶栏可见 SEV1。
 *
 *   4 条规则（和前端守卫对应，前后端双保险）：
 *     RULE_BAD_CLASSIFY  SEV2 ：plan questionType 和问题文本明显不符（"养猫"=travel，"租房"=travel）
 *     RULE_STATE_LEAP    SEV2 ：澄清阶段（needClarify=true，用户还没回答）收到了 DELIBERATE / EXECUTE / REFLECT 状态推进
 *     RULE_TOPIC_DRIFT   SEV2 ：智囊发言与问题关键词相似度 < 10%
 *     RULE_PRESET_LEAK   SEV3 ：前端 inference 带了 preset_label / preset_agents 硬编码位（目前没有，预留校验）
 *
 *   生产级要点：
 *     - 订阅回调里绝对不能 throw，全部 try/catch，否则 eventBus 炸
 *     - 写文件 fs.appendFileSync（Node 单线程 append 是原子的，32k 以下 atomic append 安全）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import BaseAgent from '../BaseAgent.js';
import eventBus from '../../services/eventBus.js';
import { isValidAuditEvent } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_FILE = process.env.AUDIT_LOG_FILE
  || path.resolve(__dirname, '../../../audit/audit.jsonl');
try { fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true }); } catch { /* exists OK */ }

export class AuditAgent extends BaseAgent {
  constructor() {
    super({ id: 'audit', name: '演·审查总管', role: 'system', timeoutMs: 60_000, retries: 0 });
    this.attached = false;
    this.sevCounts = { 1: 0, 2: 0, 3: 0 };
  }

  /** 调用一次后 attach 到 eventBus（可重复调，幂等） */
  ensureAttached() {
    if (this.attached) return;
    const safeWrap = (fn) => (...args) => { try { fn(...args); } catch { /* audit 绝不让异常扩散 */ } };
    const auditPayload = (event) => ({ sessionId: event.sessionId, ...(event.data || {}) });

    // PLAN_RESULT 出来 → 错分类审查
    eventBus.on('PLAN_RESULT', safeWrap(ev => this.checkBadClassify(auditPayload(ev))));
    // STATE_CHANGE → 状态越界审查
    eventBus.on('STATE_CHANGE', safeWrap(ev => this.checkStateLeap(auditPayload(ev))));
    // ADVISOR_SPEAK → 话题漂移审查
    eventBus.on('ADVISOR_SPEAK', safeWrap(ev => this.checkTopicDrift(auditPayload(ev))));
    this.attached = true;
  }

  /** run() 接口：读近期 audit 计数或 flush，不是主要入口（主要入口是 attach 订阅） */
  async _execute(ctx) {
    const op = (ctx.blackboard && ctx.blackboard.operation) || 'snapshot';
    if (op === 'snapshot') return { sevCounts: { ...this.sevCounts }, lastFile: AUDIT_FILE };
    if (op === 'flush') {
      try { fs.fsyncSync(fs.openSync(AUDIT_FILE, 'a')); } catch { /* noop */ }
      return { sevCounts: { ...this.sevCounts }, flushed: true };
    }
    return { sevCounts: { ...this.sevCounts } };
  }

  // ===== 规则：BAD_CLASSIFY =====
  checkBadClassify(ev) {
    if (!ev || !ev.question) return;
    const type = String(ev.questionType || '').toLowerCase();
    const q = String(ev.question || '').toLowerCase();
    let hit = false;
    const evidence = [];
    if (/(养猫|宠物|猫|狗|养宠|铲屎|布偶|撸猫|买猫|领养猫)/.test(q) && type.includes('旅行|旅游|远行|攻略|景点|度假'.replace(/\|/g, '|').slice(0,-1))) {
      hit = true; evidence.push(`问题包含"养宠/养猫"关键词，却分类为 ${ev.questionType}`);
    }
    if (/(租房|买房|搬家|定居|落户|合租|房租)/.test(q) && /(旅行|旅游|远行|攻略|度假|景点)/.test(type)) {
      hit = true; evidence.push(`问题包含"租房/买房/搬家"关键词，却分类为 ${ev.questionType}`);
    }
    if (/(结婚|恋爱|分手|女朋友|男朋友|对象|情感|家人|父母|老婆|老公|孩子)/.test(q) && /(旅行|旅游|远行|职业|跳槽|offer)/.test(type)) {
      hit = true; evidence.push(`问题包含"情感/家庭"关键词，却分类为 ${ev.questionType}`);
    }
    if (/(offer|跳槽|创业|辞职|转行|工作|职业)/.test(q) && /(旅行|旅游|远行|养宠|宠物|情感)/.test(type)) {
      hit = true; evidence.push(`问题包含"职业/工作"关键词，却分类为 ${ev.questionType}`);
    }
    if (hit) this.record({ sev: 2, rule: 'BAD_CLASSIFY', evidence: evidence.join('; ').slice(0, 200), sessionId: ev.sessionId, correlationId: ev.correlationId || 'unknown_plan', agentId: 'orchestrator' });
  }

  // ===== 规则：STATE_LEAP（澄清阶段被后端推了 DELIBERATE/EXECUTE/REFLECT） =====
  checkStateLeap(ev) {
    if (!ev || !ev.to) return;
    // 如果 session 当前需要澄清，就绝不允许跳到非澄清/非PLAN 状态
    const from = String(ev.from || '');
    const to = String(ev.to || '');
    const forbiddenDuringClarify = ['EXECUTE', 'DELIBERATE', 'REFLECT', 'ORACLE', 'COMMIT'];
    if (forbiddenDuringClarify.includes(to) && from === 'CLARIFY') {
      this.record({ sev: 2, rule: 'STATE_LEAP', evidence: `澄清阶段(CLARIFY)试图推进到 ${to}`, sessionId: ev.sessionId, correlationId: ev.correlationId || 'unknown_state' });
      return;
    }
    // needClarify=true 收到 EXECUTE/DELIBERATE 也算
    if (ev.needClarify === true && (forbiddenDuringClarify.includes(to))) {
      this.record({ sev: 2, rule: 'STATE_LEAP', evidence: `needClarify=true 时收到状态 ${from}→${to}`, sessionId: ev.sessionId, correlationId: ev.correlationId || 'unknown_state' });
    }
  }

  // ===== 规则：TOPIC_DRIFT（智囊发言和问题无关） =====
  checkTopicDrift(ev) {
    if (!ev || !ev.content || !ev.question) return;
    const q = String(ev.question || '').toLowerCase();
    const text = String(ev.content || '').toLowerCase();
    const tokQ = q.split(/[\s,，。？！；：、.!?\n]+/).filter(s => s.length >= 2);
    const tokT = text.split(/[\s,，。？！；：、.!?\n]+/).filter(s => s.length >= 2);
    let hit = 0;
    for (const t of tokQ) if (tokT.some(x => x.includes(t) || t.includes(x))) hit++;
    const score = tokQ.length === 0 ? 0 : hit / tokQ.length;
    // 场景锚：如果问题含"西藏/养猫/租房/offer"这类强锚，发言里完全没有对应簇的关键词，直接判定漂移
    const anchors = [
      { pat: /(西藏|拉萨|高原|林芝|日喀则|纳木错|珠峰|布达拉|大昭寺|八廓|转山|川藏|青藏|羊湖|羊卓|阿里|高反)/, alt: /(猫|狗|宠物|房东|租房|offer|跳槽|结婚|恋爱|股票|基金)/ },
      { pat: /(养猫|宠物|猫|狗|铲屎|布偶|撸猫|领养猫|买猫)/, alt: /(西藏|拉萨|租房|房东|房租|offer|创业|结婚|股票|基金|旅游|旅行|出差)/ },
      { pat: /(租房|买房|搬家|合租|房租|房东|物业|小区|落户|定居)/, alt: /(西藏|旅游|养猫|宠物|跳槽|创业|结婚|基金|减肥|失眠)/ },
      { pat: /(offer|跳槽|创业|辞职|转行|职业|工作|公司|薪资|面试|裁员)/, alt: /(西藏|旅游|养猫|租房|结婚|基金|失眠|减肥)/ },
      { pat: /(结婚|恋爱|分手|对象|情感|家人|父母|老婆|老公|小孩|备孕|彩礼|婚礼)/, alt: /(西藏|旅游|租房|养猫|offer|创业|股票|基金|减肥|失眠)/ },
    ];
    for (const a of anchors) {
      if (a.pat.test(q) && !a.pat.test(text) && a.alt.test(text)) {
        this.record({ sev: 2, rule: 'TOPIC_DRIFT', evidence: `强锚问题(${a.pat.toString().slice(0,40)})发言不相关，相似度=${score.toFixed(2)}:${text.slice(0,40)}`, sessionId: ev.sessionId, agentId: ev.agentId, correlationId: ev.correlationId || 'unknown_dialogue' });
        return;
      }
    }
    if (tokQ.length >= 3 && score < 0.1) {
      this.record({ sev: 3, rule: 'TOPIC_DRIFT', evidence: `相似度低 score=${score.toFixed(2)} tokQ=${tokQ.length} 发言:${text.slice(0,60)}`, sessionId: ev.sessionId, agentId: ev.agentId, correlationId: ev.correlationId || 'unknown_dialogue' });
    }
  }

  // ===== 写审计事件 =====
  record(ev) {
    const e = { sev: ev.sev, rule: ev.rule, evidence: String(ev.evidence || '').slice(0, 200), sessionId: ev.sessionId || '', agentId: ev.agentId || '', correlationId: ev.correlationId || ('auto_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), ts: Date.now() };
    if (!isValidAuditEvent(e)) return;
    this.sevCounts[e.sev] = (this.sevCounts[e.sev] || 0) + 1;
    try {
      fs.appendFileSync(AUDIT_FILE, JSON.stringify(e) + '\n', { encoding: 'utf8', mode: 0o644 });
    } catch { /* 磁盘满/只读，静默忽略，写 eventStore 兜底 */ }
    const persisted = eventBus.emit(e.sessionId, {
      type: 'AUDIT_EVENT',
      data: {
        sev: e.sev,
        rule: e.rule,
        evidence: e.evidence,
        agentId: e.agentId,
        correlationId: e.correlationId,
        ts: e.ts,
      },
      actor: 'audit',
      visibility: 'internal',
    }).catch(() => null);
    // SEV1/2 通过 eventBus 通知前端
    if (e.sev <= 2) {
      void persisted.finally(() => {
        try {
          eventBus.emit(e.sessionId, { type: 'AUDIT_ALERT', data: e, actor: 'audit' });
        } catch { /* noop */ }
      });
    }
  }
}

const singleton = new AuditAgent();
export default singleton;
