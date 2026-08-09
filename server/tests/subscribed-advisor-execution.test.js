import test from 'node:test';
import assert from 'node:assert/strict';

import * as catalog from '../src/services/advisorCatalogService.js';
import * as customAdvisors from '../src/services/customAdvisorService.js';
import * as deliberationEngine from '../src/services/deliberationEngine.js';
import * as memoryService from '../src/services/memoryService.js';

test('a subscribed market advisor can be selected and executed in the owner session', async () => {
  const publisherId = `publisher_${Date.now()}`;
  const subscriberId = `subscriber_${Date.now()}`;
  const owned = await customAdvisors.createAdvisor(publisherId, {
    name: '证据校验者',
    persona: '先核验证据，再指出信息缺口。',
    perspective: '证据视角',
    style: '克制直接',
  });
  const publication = await catalog.publishOwnedAdvisor({
    userId: publisherId,
    advisorId: owned.id,
  });
  await catalog.subscribeAdvisor({
    userId: subscriberId,
    publishedAdvisorId: publication.asset.publishedId,
  });

  const advisorId = publication.asset.advisorId;
  const sessionId = `sess_subscribed_advisor_${Date.now()}`;
  await memoryService.saveSession({
    id: sessionId,
    user_id: subscriberId,
    question: '这个方案的证据够不够？',
    question_context: '这个方案的证据够不够？',
    state: 'EXECUTE',
    plan: { agents: [], askUser: [], dimensions: [], depth: 'quick' },
    findings: [],
  });
  const claim = await memoryService.claimExecute(sessionId, {
    actionId: 'subscribed-advisor-action',
    leaseMs: 30_000,
  });
  let receivedPool = [];

  const result = await deliberationEngine.performExecute(
    sessionId,
    [advisorId],
    { actionId: 'subscribed-advisor-action', claimToken: claim.claimToken },
    claim.session,
    {
      reactLoopFn: async (_sessionId, state) => {
        receivedPool = state.advisorPool;
        state.findings.push({
          id: 'finding-subscribed',
          findingId: 'finding-subscribed',
          agentId: advisorId,
          claim: '当前证据仍缺少一个可验证来源。',
          evidenceIds: [],
        });
        return { state: 'ROUND_REVIEW' };
      },
      reflectFn: async (state) => ({
        session: { ...state, state: 'ORACLE', oracle: null },
        replanned: false,
        oracle: null,
        conflicts: [],
        gaps: [],
      }),
      emitFn: async () => {},
    },
  );

  assert.equal(receivedPool.length, 1);
  assert.equal(receivedPool[0].id, advisorId);
  assert.equal(receivedPool[0].name, '证据校验者');
  assert.equal(receivedPool[0].isSubscribed, true);
  assert.equal(result.state, 'ROUND_REVIEW');
});

test('a public market advisor can be tried in one council without forcing a subscription', async () => {
  const publisherId = `public_publisher_${Date.now()}`;
  const visitorId = `public_visitor_${Date.now()}`;
  const owned = await customAdvisors.createAdvisor(publisherId, {
    name: '现场试用者',
    persona: '只针对本轮问题给出一个可验证假设。',
    perspective: '试验视角',
  });
  const publication = await catalog.publishOwnedAdvisor({
    userId: publisherId,
    advisorId: owned.id,
  });
  const advisorId = publication.asset.advisorId;
  const sessionId = `sess_public_advisor_${Date.now()}`;
  await memoryService.saveSession({
    id: sessionId,
    user_id: visitorId,
    question: '先试哪个方案？',
    state: 'EXECUTE',
    plan: { agents: [], askUser: [], dimensions: [], depth: 'quick' },
    findings: [],
  });
  const claim = await memoryService.claimExecute(sessionId, {
    actionId: 'public-advisor-action',
    leaseMs: 30_000,
  });
  let receivedPool = [];

  const result = await deliberationEngine.performExecute(
    sessionId,
    [advisorId],
    { actionId: 'public-advisor-action', claimToken: claim.claimToken },
    claim.session,
    {
      reactLoopFn: async (_sessionId, state) => {
        receivedPool = state.advisorPool;
        state.findings.push({
          id: 'finding-public',
          findingId: 'finding-public',
          agentId: advisorId,
          claim: '可以先做一个可逆的小范围试验。',
          evidenceIds: [],
        });
        return { state: 'ROUND_REVIEW' };
      },
      reflectFn: async (state) => ({
        session: { ...state, state: 'ORACLE', oracle: null },
        replanned: false,
        oracle: null,
        conflicts: [],
        gaps: [],
      }),
      emitFn: async () => {},
    },
  );

  assert.equal(receivedPool.length, 1);
  assert.equal(receivedPool[0].id, advisorId);
  assert.equal(receivedPool[0].isSubscribed, false);
  assert.equal(result.state, 'ROUND_REVIEW');
});
