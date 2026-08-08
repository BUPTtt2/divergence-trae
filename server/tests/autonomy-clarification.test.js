import test from 'node:test';
import assert from 'node:assert/strict';

import * as autonomyGate from '../src/services/autonomyGate.js';

test('缺失字段解析保留逗号分隔，不把多个字段粘成一个', () => {
  assert.equal(typeof autonomyGate.parseMissingPrereqFields, 'function');
  assert.deepEqual(
    autonomyGate.parseMissingPrereqFields('当前留存数据, 三个月预算，停止指标。'),
    ['当前留存数据', '三个月预算', '停止指标'],
  );
});

test('一轮追问把前三个关键变量合并成一个问题任务', () => {
  assert.equal(typeof autonomyGate.collapseClarificationTriggers, 'function');
  assert.deepEqual(
    autonomyGate.collapseClarificationTriggers([
      { field: '当前留存数据', reason: '缺少数据', source: 'P0', priority: 0 },
      { field: '三个月预算', reason: '缺少预算', source: 'P0', priority: 0 },
      { field: '停止指标', reason: '缺少阈值', source: 'P0', priority: 0 },
      { field: '其他', reason: '次要', source: 'P3', priority: 3 },
    ]),
    {
      field: '当前留存数据、三个月预算、停止指标',
      reason: '需要补充：当前留存数据、三个月预算、停止指标',
      source: 'P0',
      priority: 0,
    },
  );
});
