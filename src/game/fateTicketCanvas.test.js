import test from 'node:test';
import assert from 'node:assert/strict';
import { createFateTicketPresentation } from './fateTicketPresentation.js';
import { exportFateTicketPng, renderFateTicketCanvas } from './fateTicketCanvas.js';

function fakeCanvasFactory() {
  const operations = [];
  const gradient = { addColorStop: (...args) => operations.push(['colorStop', ...args]) };
  const context = new Proxy({
    operations,
    measureText: (value) => ({ width: String(value).length * 28 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return (...args) => operations.push([property, ...args]);
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  });
  return {
    width: 0,
    height: 0,
    context,
    getContext: () => context,
    toBlob: (callback) => callback(new Blob(['png'], { type: 'image/png' })),
  };
}

test('renders one portrait PNG canvas from the canonical presentation', () => {
  const presentation = createFateTicketPresentation({
    ticketId: 'ticket-canvas',
    question: '怎样在控制风险的同时推进？',
    summary: '从一个可逆动作开始。',
    path: { label: '先验证', keyPoints: ['确认边界'] },
  });
  const canvas = renderFateTicketCanvas(presentation, { canvasFactory: fakeCanvasFactory });

  assert.equal(canvas.width, 1024);
  assert.equal(canvas.height, 1536);
  assert.equal(canvas.context.operations.some(([name]) => name === 'fillText'), true);
});

test('exports the rendered card as a PNG and releases the temporary URL', async () => {
  const presentation = createFateTicketPresentation({ ticketId: 'ticket-export', path: { label: '先验证' } });
  const link = { clicked: false, click() { this.clicked = true; } };
  const released = [];
  const filename = await exportFateTicketPng(presentation, {
    canvasFactory: fakeCanvasFactory,
    linkFactory: () => link,
    urlFactory: {
      createObjectURL: () => 'blob:test-card',
      revokeObjectURL: (url) => released.push(url),
    },
  });

  assert.equal(link.clicked, true);
  assert.equal(link.href, 'blob:test-card');
  assert.equal(link.download, filename);
  assert.match(filename, /^演策命牌-/);
  assert.deepEqual(released, ['blob:test-card']);
});
