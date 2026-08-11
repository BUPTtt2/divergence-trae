import test from 'node:test';
import assert from 'node:assert/strict';

import { createDestinyCardPresentation } from './destinyCardPresentation.js';

test('compresses a long dossier into fixed commemorative card slots', () => {
  const card = createDestinyCardPresentation({
    ticketId: 'ft_demo_123456789',
    question: '我现在需要在很多限制条件之下判断要不要继续推进这件已经讨论很久而且包含大量背景信息的事情',
    summary: '综合所有智囊的判断，我们应该先做一个可逆的小范围验证，并记录结果，再根据反馈决定是否继续扩大投入。这里还有更多不应直接贴到卡面的解释。',
    path: {
      label: '先做一次小范围验证再决定',
      keyPoints: ['在本周内完成一次成本可控的小范围验证', '记录真实反馈并明确成功阈值', '达到阈值后再扩大投入'],
      reversalConditions: ['验证结果连续两次低于最低阈值时停止'],
    },
    hexagram: { primary: '风山渐' },
    timestamp: Date.UTC(2026, 7, 11),
  });

  assert.equal(card.sealTitle.length <= 4, true);
  assert.equal(card.question.length <= 34, true);
  assert.equal(card.verdict.length <= 42, true);
  assert.deepEqual(card.anchors.map((item) => item.label), ['断', '行', '戒']);
  assert.equal(card.anchors.every((item) => item.text.length <= 24), true);
  assert.equal(card.archiveId, 'DEMO-1234');
});

test('uses the generated artwork when present and otherwise keeps the local archival artwork', () => {
  const local = createDestinyCardPresentation({ path: { label: '保留选择权' } });
  const generated = createDestinyCardPresentation({
    path: { label: '保留选择权' },
    artwork: { url: 'https://example.test/fate.jpg', source: 'seedream' },
  });

  assert.equal(local.artworkUrl, '/assets/generated/xuanmo/destiny-card-archive-v1.png');
  assert.equal(local.artworkSource, 'archive');
  assert.equal(generated.artworkUrl, 'https://example.test/fate.jpg');
  assert.equal(generated.artworkSource, 'seedream');
});

test('never invents detail when the fate ticket is sparse', () => {
  const card = createDestinyCardPresentation({});
  assert.equal(card.question, '本局所问');
  assert.equal(card.verdict, '判断已形成，留待行动验证');
  assert.equal(card.anchors[1].text, '从一个可逆动作开始');
});

test('keeps an archived ISO date instead of replacing it with today', () => {
  const card = createDestinyCardPresentation({ timestamp: '2026-08-09T08:00:00.000Z' });
  assert.match(card.date, /2026/);
});
