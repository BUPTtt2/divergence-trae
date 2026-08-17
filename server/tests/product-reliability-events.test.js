import test from 'node:test';
import assert from 'node:assert/strict';

import { artworkReliabilityEvent } from '../src/services/productAnalytics.js';

test('artwork reliability event contains status and timing but no generated image or decision content', () => {
  const event = artworkReliabilityEvent({
    available: true,
    model: 'seedream-5-pro',
    url: 'https://private.example/image.png',
    usage: { images: 1 },
  }, 4200);
  assert.deepEqual(event, {
    event: 'artwork_request_completed',
    properties: {
      provider: 'volcengine',
      model: 'seedream-5-pro',
      success: true,
      durationMs: 4200,
      retryCount: 0,
      errorCode: '',
    },
  });
  assert.equal(JSON.stringify(event).includes('private.example'), false);
});
