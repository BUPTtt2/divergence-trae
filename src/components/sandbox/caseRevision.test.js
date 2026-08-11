import test from 'node:test';
import assert from 'node:assert/strict';

import { createCaseRevisionDraft, serializeCaseCorrections } from './caseRevision.js';

test('case correction serializes only edited facts, understanding, and unknowns', () => {
  const caseFile = {
    understanding: '两人预算总计 2000 元。',
    facts: [{ id: 'budget', question: '预算', value: '总计 2000 元' }],
    unknowns: [{ id: 'commute', question: '通勤上限是多少？' }],
  };
  const draft = createCaseRevisionDraft(caseFile);
  draft.facts.budget = '每人 2000 元';
  draft.understanding = '两人预算口径为每人 2000 元。';

  assert.equal(serializeCaseCorrections(caseFile, draft), [
    '纠正事实“预算”：总计 2000 元 → 每人 2000 元',
    '纠正系统理解：两人预算总计 2000 元。 → 两人预算口径为每人 2000 元。',
  ].join('\n'));
});
