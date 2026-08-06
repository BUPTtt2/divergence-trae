/**
 * 真·多Agent 统一数据契约（公共类型，所有Agent共享，任何Agent只能消费不新增私有字段散落在外）
 *
 * 为什么把所有类型放到一个文件里：
 *   按照之前的经验，把数据契约/导出契约先冻结，可以避免"消费者改一处，生产者又改另一处"带来的命名冲突与回归。
 *   修改本文件 = 修改全局契约，任何 breaking change 都要先改这里。
 */

/** @typedef {'system'|'advisor'|'tool'} AgentRole */

/**
 * 所有 Agent.run() 的唯一入参
 * correlationId 必须由 AgentRunner 生成，任何 Agent 不允许自造
 * blackboard 是**只读副本**，Agent 要写数据必须 return output，通过 Orchestrator 合并回主黑板
 * @typedef {Object} SessionCtx
 * @property {string} sessionId    推演会话 id（前端 sess_ / ls_）
 * @property {string} userId       用户 id (usr_ 或 local_usr)
 * @property {number} round        当前轮次，0-based
 * @property {string} correlationId runId = hash(sessionId+agentId+round+ts)
 * @property {AbortSignal} [signal] 超时/取消信号，Agent 内部 await 之间要 periodically check
 * @property {Record<string,any>} blackboard 只读黑板（问题/维度/记忆/上轮产出…）
 */

/**
 * 统一智囊产出 Finding（替代之前 inference.agentDialogues 这个 map 里的 string）
 * @typedef {Object} Finding
 * @property {string} agentId
 * @property {string} agentName
 * @property {string} dimension    视角标签（风险/成本/情感/健康…）
 * @property {string} [stance]     立场 PRO/CON/NEUTRAL
 * @property {number} [intensity]  0~1
 * @property {string} content      发言正文
 * @property {string} [toolUsed]   如果是 tool_call 产出，写工具名
 * @property {number} ts           产出时间戳 Date.now()
 */

/**
 * AuditAgent 的审查事件（append-only，audit.jsonl 不落盘以外，还会写入 eventStore 的 audit 分区）
 * SEV1 = 致命（立即在前端顶栏告警，用户可见）：错分类导致视角全错、发言严重越界、调用未授权模块
 * SEV2 = 严重（只打日志）：澄清阶段被后端推了 EXECUTE、话题漂移相似度 < 10%
 * SEV3 = 警告：前端疑似展示了预设标签、LLM 超时重试 2 次才成功
 * @typedef {Object} AuditEvent
 * @property {1|2|3} sev
 * @property {string} rule         规则名，如 'TOPIC_MISMATCH' / 'STATE_LEAP' / 'BAD_CLASSIFY' / 'PRESET_LEAK'
 * @property {string} evidence     人类可读证据字符串，≤ 200 chars
 * @property {string} sessionId
 * @property {string} [agentId]    如果是某个 agent 触发的
 * @property {string} correlationId
 * @property {number} ts
 */

/**
 * MemoryAgent 的三层记忆（不再让其他模块直接读 memoryService）
 * L1 profile   = 长期命格：收入/过敏/养宠/家庭/地区…（写 profile 分区，只有系统 agent 能写）
 * L2 summary   = 单次推演摘要，≤300 字（推演结束时由 Orchestrator 调 Memory.saveSummary 写入）
 * L3 related   = recall 相关 top N，来自 L1+L2 的相似度聚合
 * @typedef {Object} MemoryRecord
 * @property {string} userId
 * @property {'profile'|'summary'|'related'} type
 * @property {string} key
 * @property {string} content
 * @property {Record<string,any>} [meta]
 * @property {number} ts
 */

/**
 * AnimationAgent 的 phase→动画排程 JSON（只输出结构，不操作 DOM）
 * @typedef {Object} AnimationStep
 * @property {string} name         'casting_throw' / 'yan_pulse' / 'advisor_light' / 'reflect_converge' / 'oracle_reveal' …
 * @property {number} durationMs   时长毫秒
 * @property {Record<string,any>} [params] 如 {agentId, color, intensity}
 */
/**
 * @typedef {Object} AnimationTimeline
 * @property {string} phase        'casting'/'yan_analyze'/'agent_debate'/'reflecting'/'summary'/'oracle'/'commit'
 * @property {AnimationStep[]} steps
 */

/* ===== 纯运行时校验工具（不引 ajv，零依赖） ===== */
export function isString(val, minLen = 1) {
  return typeof val === 'string' && val.length >= minLen;
}
export function isValidSessionCtx(ctx) {
  if (!ctx || typeof ctx !== 'object') return false;
  return isString(ctx.sessionId, 3) && isString(ctx.userId, 3) && typeof ctx.round === 'number' && isString(ctx.correlationId, 6);
}
export function isValidFinding(f) {
  if (!f || typeof f !== 'object') return false;
  return isString(f.agentId, 1) && isString(f.content, 2) && typeof f.ts === 'number';
}
export function isValidAuditEvent(e) {
  if (!e || typeof e !== 'object') return false;
  return [1,2,3].includes(e.sev) && isString(e.rule, 2) && isString(e.sessionId, 3) && isString(e.correlationId, 6);
}
