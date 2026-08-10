import test from 'node:test';
import assert from 'node:assert/strict';
import BaseAgent from '../src/agents/BaseAgent.js';
import { run } from '../src/agents/AgentRunner.js';

class CountingAgent extends BaseAgent {
  constructor() {
    super({ id: 'counting', name: 'Counting', role: 'advisor', retries: 0 });
    this.calls = 0;
  }

  async _execute() {
    this.calls += 1;
    return { calls: this.calls };
  }
}

test('same actionId returns the cached Agent result', async () => {
  const agent = new CountingAgent();
  const ctx = {
    sessionId: 'sess_cache',
    userId: 'usr_cache',
    round: 1,
    actionId: 'act_cache_001',
  };

  const first = await run(agent, ctx);
  const second = await run(agent, ctx);

  assert.equal(first.output.calls, 1);
  assert.equal(second.output.calls, 1);
  assert.equal(second.meta.cacheHit, true);
  assert.equal(agent.calls, 1);
});

test('concurrent calls with the same actionId share one in-flight run', async () => {
  const agent = new CountingAgent();
  const ctx = {
    sessionId: 'sess_flight',
    userId: 'usr_flight',
    round: 1,
    actionId: 'act_flight_001',
  };

  const [first, second] = await Promise.all([run(agent, ctx), run(agent, ctx)]);

  assert.equal(first.output.calls, 1);
  assert.equal(second.output.calls, 1);
  assert.equal(agent.calls, 1);
});

test('timeout aborts an Agent that observes ctx.signal', async () => {
  class AbortableAgent extends BaseAgent {
    constructor() {
      super({ id: 'abortable', name: 'Abortable', role: 'tool', timeoutMs: 30, retries: 0 });
    }

    async _execute(ctx) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 5000);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('aborted'));
        }, { once: true });
      });
      return {};
    }
  }

  await assert.rejects(
    run(new AbortableAgent(), {
      sessionId: 'sess_abort',
      userId: 'usr_abort',
      round: 1,
      actionId: 'act_abort_001',
    }),
    /aborted|timeout|超时/i,
  );
});
