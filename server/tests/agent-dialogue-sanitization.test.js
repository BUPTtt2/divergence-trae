import test from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeAgentDialogue } from '../src/services/agentEngine.js';

test('agent dialogue removes leaked prompt tags and repeated user-input blocks', () => {
  const question = '我是否应该继续投入演策？';
  const raw = `<user_input>${question}</user_input>\n<mention to="fengyan" snippet="undefined">我同意风眼的风险判断。</mention> 先定义七日留存。`;

  const sanitized = sanitizeAgentDialogue(raw, question);

  assert.equal(sanitized, '我同意风眼的风险判断。 先定义七日留存。');
  assert.doesNotMatch(sanitized, /<\/?[a-z_]/i);
  assert.doesNotMatch(sanitized, /snippet="undefined"/);
  assert.doesNotMatch(sanitized, new RegExp(question));
});
