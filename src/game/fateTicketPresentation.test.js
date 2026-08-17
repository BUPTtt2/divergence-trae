import test from 'node:test';
import assert from 'node:assert/strict';
import { createFateTicketPresentation } from './fateTicketPresentation.js';
import { createDestinyCardPresentation } from './destinyCardPresentation.js';
import { buildFateCardPresentation } from './fateCardPresentation.js';

const ticket = {
  ticketId: 'ft_unified_20260817',
  timestamp: '2026-08-17T08:00:00.000Z',
  question: '要不要接受新工作，同时保留现有客户？',
  summary: '先验证时间成本，再决定是否长期切换。',
  path: {
    label: '先做两周可逆试运行',
    keyPoints: ['确认交付边界', '记录精力变化'],
    reversalConditions: ['连续三天影响睡眠就停止'],
  },
  hexagram: { primary: '风山渐' },
  cardCopy: {
    source: 'generated',
    sealTitle: '渐进验真',
    verse: '循序而行，见真再定。',
    verdict: '先验证协作成本。',
    insight: '机会与负荷需要同时核对。',
    nextAction: '本周约定两周试运行。',
    guardrail: '睡眠受损就停止。',
  },
  artwork: { url: 'https://example.test/art.png', source: 'seedream' },
};

test('one canonical model drives final artifact, collection and 3D fields', () => {
  const canonical = createFateTicketPresentation(ticket);
  const collection = createDestinyCardPresentation(ticket);
  const scene = buildFateCardPresentation({
    fateContent: ticket,
    selectedChoice: ticket.path,
    question: ticket.question,
  });

  assert.equal(canonical.sealTitle, '渐进验真');
  assert.equal(collection.sealTitle, canonical.sealTitle);
  assert.equal(collection.question, canonical.question);
  assert.equal(collection.artworkUrl, canonical.artworkUrl);
  assert.equal(scene.title, canonical.sealTitle);
  assert.equal(scene.question, canonical.question.slice(0, 32));
  assert.deepEqual(scene.actions, canonical.actions);
});

test('system artwork is immediate and generated artwork keeps explicit provenance', () => {
  const system = createFateTicketPresentation({ path: { label: '保留选择权' } });
  const generated = createFateTicketPresentation(ticket);

  assert.equal(system.artworkSource, 'system');
  assert.equal(system.artworkUrl, '/assets/generated/xuanmo/destiny-card-archive-v1.png');
  assert.equal(system.artworkLabel, '系统典藏画境');
  assert.equal(generated.artworkSource, 'generated');
  assert.equal(generated.artworkLabel, '专属画境');
});
