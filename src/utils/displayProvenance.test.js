import test from 'node:test';
import assert from 'node:assert/strict';

import { displaySourceMark, sanitizeProductCopy } from './displayProvenance.js';

test('displaySourceMark distinguishes model output from actual offline fallback', () => {
  assert.deepEqual(displaySourceMark('model'), { mark: '灵', label: '由模型根据本局信息生成' });
  assert.deepEqual(displaySourceMark('local_fate_fallback'), { mark: '藏', label: '离线推演结果' });
  assert.deepEqual(displaySourceMark('controlled-fallback'), { mark: '藏', label: '离线推演结果' });
});

test('sanitizeProductCopy removes internal preset wording at render boundaries', () => {
  assert.equal(sanitizeProductCopy('预设智囊 · 自定义铸造'), '常驻智囊 · 自定义铸造');
  assert.equal(sanitizeProductCopy('预设模式 · 数据仅本机可见'), '本机模式 · 数据仅本机可见');
  assert.equal(sanitizeProductCopy('四局预设，立等开演'), '四局精选，立等开演');
  assert.equal(sanitizeProductCopy('真实命牌已经归档'), '真实命牌已经归档');
});
