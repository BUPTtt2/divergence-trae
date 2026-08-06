/**
 * BaseAgent —— 所有 Agent 的唯一抽象基类（系统 Agent / 智囊 Agent / 工具 Agent 都继承它）
 *
 * 为什么需要 BaseAgent？
 *   之前的 planner/deliberationEngine/reactLoop 各自 import 不同的 helper，
 *   模块之间散着调，连"超时控制"都写了 3 版 (planner 8s, ReAct 15s, Advisor 20s)。
 *   现在统一：
 *     - 入参强制 SessionCtx（correlationId / signal 是必须的）
 *     - run() 是唯一入口，任何 Agent 不对外暴露其他 async 方法
 *     - role 必须声明：system=系统(高权限) / advisor=智囊(只发言) / tool=工具(只干单一活)
 *     - audit(sev,rule,evidence) 通知 AuditAgent
 *
 * 子类必须实现：
 *   async _execute(ctx)  —— 实际业务逻辑
 *   this.name            —— 人类可读名字
 *   this.id              —— 稳定 id，如 'orchestrator' / 'memory' / 'audit'
 */
import EventEmitter from 'node:events';
import { isValidSessionCtx, isString } from './types.js';

export class BaseAgent extends EventEmitter {
  /**
   * @param {{id:string, name:string, role: 'system'|'advisor'|'tool', timeoutMs?: number, retries?: number}} meta
   */
  constructor(meta) {
    super();
    if (!meta || !isString(meta.id, 2) || !isString(meta.name, 2)) {
      throw new Error(`[BaseAgent] invalid meta: ${JSON.stringify(meta)}`);
    }
    if (!['system', 'advisor', 'tool'].includes(meta.role)) {
      throw new Error(`[BaseAgent] role must be system/advisor/tool, got '${meta.role}' for ${meta.id}`);
    }
    this.id = meta.id;
    this.name = meta.name;
    this.role = meta.role;
    this.timeoutMs = meta.timeoutMs || 90000;
    this.retries = typeof meta.retries === 'number' ? meta.retries : 1;
  }

  /**
   * 对外统一入口。任何模块要调 Agent，只能调 run(ctx)
   * @param {import('./types.js').SessionCtx} ctx
   * @returns {Promise<{ok:boolean, output:any, meta:Record<string,any>}>}
   */
  async run(ctx) {
    if (!isValidSessionCtx(ctx)) {
      throw new Error(`[${this.id}] invalid SessionCtx: ${JSON.stringify(ctx).slice(0, 200)}`);
    }
    const startedAt = Date.now();
    try {
      const output = await this._execute({ ...ctx, blackboard: Object.freeze({ ...(ctx.blackboard || {}) }) });
      return {
        ok: true,
        output,
        meta: { agentId: this.id, agentName: this.name, latencyMs: Date.now() - startedAt, retries: 0, ts: startedAt }
      };
    } catch (err) {
      this.audit(2, 'AGENT_RUN_FAIL', `${this.id}: ${(err && err.message || String(err)).slice(0, 180)}`, ctx);
      throw err;
    }
  }

  /**
   * 子类实现：实际业务。入参 ctx.blackboard 是 Object.freeze 的只读副本，禁止直接写。
   * @abstract
   * @param {import('./types.js').SessionCtx} _ctx
   * @returns {Promise<any>}
   */
  async _execute(_ctx) {
    throw new Error(`[${this.id}] subclass must implement _execute(ctx)`);
  }

  /**
   * 发审计事件 —— AuditAgent 订阅 agent_id.audit 事件
   */
  audit(sev, rule, evidence, ctx) {
    try {
      this.emit('audit', {
        sev: sev in { 1:1,2:2,3:3 } ? sev : 3,
        rule: String(rule || 'UNKNOWN'),
        evidence: String(evidence || '').slice(0, 200),
        sessionId: ctx && ctx.sessionId,
        agentId: this.id,
        correlationId: ctx && ctx.correlationId,
        ts: Date.now()
      });
    } catch { /* audit 绝不能把异常抛给业务 */ }
  }
}

export default BaseAgent;
