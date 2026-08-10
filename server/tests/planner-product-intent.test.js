import test from 'node:test';
import assert from 'node:assert/strict';

import { detectQuestionType } from '../src/services/planner.js';
import { detectToolNeeds } from '../src/services/toolProbeService.js';
import * as planner from '../src/services/planner.js';

test('复赛产品与用户留存问题不会被误判为求职 career', async () => {
  assert.equal(
    await detectQuestionType('我是否应该继续投入演策，并以复赛真实用户留存作为验证目标？'),
    'competition',
  );
  assert.equal(
    await detectQuestionType('这个 AI Agent 产品要不要继续迭代三个月？'),
    'product',
  );
});

test('career 未出现真实公司时不伪造腾讯 company_info 证据', () => {
  assert.deepEqual(detectToolNeeds('我要不要换一份工作？', 'career'), []);
  assert.deepEqual(
    detectToolNeeds('我要不要接受腾讯的 offer？', 'career'),
    ['web_search', 'company_info'],
  );
  assert.deepEqual(detectToolNeeds('复赛产品是否值得继续做？', 'competition'), []);
});

test('已有 Agent 分析时不再串行追加一轮重复的演分析 LLM', async () => {
  assert.equal(typeof planner.ensurePlannerAnalysis, 'function');
  let generated = 0;
  const analysis = await planner.ensurePlannerAnalysis('已有分析', async () => {
    generated += 1;
    return '重复分析';
  });
  assert.equal(analysis, '已有分析');
  assert.equal(generated, 0);
});
