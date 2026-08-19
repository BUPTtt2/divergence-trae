import test from 'node:test';
import assert from 'node:assert/strict';

import { BRAND, getBrandAsset } from './brandMarkModel.js';

test('brand identity has one canonical public name and promise', () => {
  assert.equal(BRAND.name, '演策');
  assert.equal(BRAND.latinName, 'YANCE AI');
  assert.equal(BRAND.promise, '把一个纠结，推演成可行动的决定。');
});

test('brand assets resolve from the same public source family', () => {
  assert.equal(getBrandAsset('mark'), '/brand/yance-mark.svg');
  assert.equal(getBrandAsset('wordmark'), '/brand/yance-wordmark.svg');
  assert.equal(getBrandAsset('social'), '/brand/yance-social.svg');
  assert.throws(() => getBrandAsset('legacy-seal'), /UNKNOWN_BRAND_ASSET/);
});
