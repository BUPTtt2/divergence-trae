import test from 'node:test';
import assert from 'node:assert/strict';

import { isEmbeddingAvailable } from '../src/services/embeddingService.js';

test('免费运行模式可显式关闭付费 embedding', () => {
  const previousKey = process.env.ZHIPU_API_KEY;
  const previousFlag = process.env.ZHIPU_EMBEDDINGS_ENABLED;
  process.env.ZHIPU_API_KEY = 'test-key';
  process.env.ZHIPU_EMBEDDINGS_ENABLED = 'false';

  try {
    assert.equal(isEmbeddingAvailable(), false);
  } finally {
    if (previousKey === undefined) delete process.env.ZHIPU_API_KEY;
    else process.env.ZHIPU_API_KEY = previousKey;
    if (previousFlag === undefined) delete process.env.ZHIPU_EMBEDDINGS_ENABLED;
    else process.env.ZHIPU_EMBEDDINGS_ENABLED = previousFlag;
  }
});
