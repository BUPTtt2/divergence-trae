import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAdvisorAgents } from '../src/services/reactLoop.js';

const pool = [
  { id: 'qiangu', name: '乾估' },
  { id: 'jiankang', name: '健康' },
  { id: 'jiaoyu', name: '教育' },
];

test('resolveAdvisorAgents accepts IDs and names from the current advisor pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['jiankang', '乾估'], pool).map((agent) => agent.id),
    ['jiankang', 'qiangu'],
  );
});

test('resolveAdvisorAgents replaces stale model choices with the current advisor pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['镜渊', '风眼'], pool).map((agent) => agent.id),
    ['qiangu', 'jiankang'],
  );
});

test('resolveAdvisorAgents removes duplicates without leaving the current pool', () => {
  assert.deepEqual(
    resolveAdvisorAgents(['健康', 'jiankang', 'unknown'], pool).map((agent) => agent.id),
    ['jiankang'],
  );
});
