import test from 'node:test';
import assert from 'node:assert/strict';

const identityModel = await import('./decisionCardIdentityModel.js').catch(() => null);

test('decision-card source identity exposes only renderable strings', () => {
  assert.ok(identityModel, 'decisionCardIdentityModel module must exist');
  assert.deepEqual(identityModel.decisionCardSourceIdentity({ source: 'model' }), {
    mark: '灵',
    label: '由模型根据本局信息生成',
  });
  assert.deepEqual(identityModel.decisionCardSourceIdentity({ source: 'local_fate_fallback' }), {
    mark: '藏',
    label: '离线推演结果',
  });
  assert.equal(typeof identityModel.decisionCardSourceIdentity({}).mark, 'string');
  assert.equal(typeof identityModel.decisionCardSourceIdentity({}).label, 'string');
});

