import test from 'node:test';
import assert from 'node:assert/strict';

import { callPlannerLLM } from '../src/services/planner.js';

test('planner retries only after the previous provider call has settled', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const delayedProvider = async () => {
    calls += 1;
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    return calls === 1 ? null : 'ok';
  };

  const result = await callPlannerLLM([], {}, {
    call: delayedProvider,
    retries: 1,
    delayMs: 0,
    name: 'delayed-provider',
  });

  assert.equal(result, 'ok');
  assert.equal(calls, 2);
  assert.equal(maxActive, 1);
});
