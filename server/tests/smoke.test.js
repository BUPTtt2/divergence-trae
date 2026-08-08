// Smoke tests for multiAgent engine - node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('[P0] BaseAgent: shape + abstract _execute contract', async () => {
  const { default: BaseAgent } = await import(path.join(ROOT, 'src/agents/BaseAgent.js'));
  class DummyAgent extends BaseAgent {
    constructor() { super({ id: 'dummy', name: 'Dummy', role: 'system' }); }
    async _execute() { return { ok: true }; }
  }
  const a = new DummyAgent();
  assert.equal(a.id, 'dummy');
  assert.equal(typeof a.run, 'function');
  const ctx = {
    sessionId: 'sess_test_001',
    userId: 'usr_test_001',
    round: 0,
    actionId: 'act_test_001',
    correlationId: 'corr_test_001_xxxxx',
  };
  const out = await a.run(ctx);
  assert.ok(out && out.ok);
});

test('[P0] AgentRunner: correlationId + timeout enforcement', async () => {
  const { default: BaseAgent } = await import(path.join(ROOT, 'src/agents/BaseAgent.js'));
  const mod = await import(path.join(ROOT, 'src/agents/AgentRunner.js'));
  const run = mod.run || mod.default?.run;
  assert.equal(typeof run, 'function', 'AgentRunner.run 必须是函数');

  class SlowAgent extends BaseAgent {
    constructor() { super({ id: 'slow', name: 'Slow', role: 'system', timeoutMs: 40, retries: 0 }); }
    async _execute(ctx) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return { ok: true };
    }
  }
  await assert.rejects(
    run(new SlowAgent(), {
      sessionId: 'sess_slow',
      userId: 'usr_slow',
      round: 0,
      actionId: 'act_slow_001',
      blackboard: {},
    }),
    /Abort|aborted|timeout|超时/i,
    'AgentRunner 必须在 timeoutMs 到达后中止'
  );

  class FastAgent extends BaseAgent {
    constructor() { super({ id: 'fast', name: 'Fast', role: 'advisor', timeoutMs: 5000, retries: 0 }); }
    async _execute() { return { ok: 42 }; }
  }
  const out = await run(new FastAgent(), {
    sessionId: 'sess_fast',
    userId: 'usr_fast',
    round: 0,
    actionId: 'act_fast_001',
    blackboard: {},
  });
  assert.ok(out && out.ok);
  assert.equal(out.output.ok, 42);
  assert.ok(out.meta && typeof out.meta.latencyMs === 'number');
});

test('[P0] OrchestratorAgent heuristic: 养猫/西藏 不会 questions=0', async () => {
  process.chdir(ROOT);
  const { default: OrchestratorAgent } = await import(path.join(ROOT, 'src/agents/system/OrchestratorAgent.js'));
  const agent = new OrchestratorAgent();
  for (const q of ['我想养猫，预算 300，合租', '要不要今年去西藏玩一个星期']) {
    // planViaHeuristic 为公开入口（同步）
    const plan = agent.planViaHeuristic(q, {});
    assert.ok(plan, `Orchestrator 对 "${q}" 必须返回 plan`);
    assert.ok(Array.isArray(plan.questions) && plan.questions.length >= 2,
      `questions 至少 2 个（当前 ${plan.questions?.length}）`);
    // perspectivePool 经 buildPerspectivePool 生成（异步）
    const pool = await agent.buildPerspectivePool(q, plan.dimensions || []);
    assert.ok(Array.isArray(pool) && pool.length >= 2,
      `perspectivePool 至少 2 个（当前 ${pool?.length}）`);
    assert.ok(Array.isArray(plan.dimensions) && plan.dimensions.length >= 2,
      `dimensions 至少 2 个（当前 ${plan.dimensions?.length}）`);
  }
});

test('[P0] autonomyGate heuristic: pet/travel 产生 clarify 问题（避免 0 问澄清卡）', async () => {
  process.chdir(ROOT);
  const { detectMissingPrereqsHeuristic } = await import(path.join(ROOT, 'src/services/autonomyGate.js'));
  for (const [q, expectKey] of [
    ['我想养猫，合租，室友意见未定', /品种|预算|居住|时间|过敏|室友/],
    ['今年去西藏玩，预算一万', /时间|同行|预算|玩法|高原|住宿|季节|高反/],
  ]) {
    const list = detectMissingPrereqsHeuristic(q);
    assert.ok(Array.isArray(list) && list.length >= 3,
      `"${q}" 启发式澄清问题需 >=3（当前 ${list?.length}）`);
    const txt = list.map(x => (typeof x === 'string' ? x : (x.field || x.question || ''))).join(' ');
    assert.match(txt, expectKey, '澄清问题关键词覆盖不足: ' + txt.slice(0, 80));
  }
});
