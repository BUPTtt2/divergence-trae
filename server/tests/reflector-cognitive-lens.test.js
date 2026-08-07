import test from 'node:test';
import assert from 'node:assert/strict';

import * as deliberationEngine from '../src/services/deliberationEngine.js';
import * as memoryService from '../src/services/memoryService.js';
import { runMigrations } from '../src/services/migrations.js';
import { mapToHexagram, reflect } from '../src/services/reflector.js';
import { normalizeExecuteResponse } from '../../shared/deliberationContract.js';

const FORBIDDEN_VERDICT = /(?:吉|凶|可进|宜止)/;

function createSession() {
  return {
    id: 'sess_cognitive_lens',
    question: '是否在本月更换供应商？',
    replan_count: 1,
    state: 'REFLECT',
    sessionSeed: 'seed-stage-06',
    plan: {
      dimensions: [
        { name: '战略', perspective: 'strategic' },
        { name: '风险', perspective: 'risk' },
        { name: '成本', perspective: 'financial' },
        { name: '行动', perspective: 'action' },
        { name: '沟通', perspective: 'communication' },
        { name: '实施', perspective: 'practical' },
      ],
    },
    findings: [
      {
        id: 'finding_strategic',
        agentId: 'a1',
        perspective: 'strategic',
        content: '已核验供应商交付周期为 14 天',
        stance: 'positive',
        intensity: 0.95,
        evidenceStatus: 'accepted',
        evidenceId: 'ev_delivery',
      },
      {
        id: 'finding_risk_a',
        agentId: 'a2',
        perspective: 'risk',
        content: '法务认为违约暴露较高',
        stance: 'negative',
        intensity: 0.9,
        evidenceStatus: 'contested',
      },
      {
        id: 'finding_risk_b',
        agentId: 'a3',
        perspective: 'risk',
        content: '业务认为可由备选供应商吸收风险',
        stance: 'positive',
        intensity: 0.85,
        evidenceStatus: 'contested',
      },
      {
        id: 'finding_action',
        agentId: 'a4',
        perspective: 'action',
        content: '切换演练有可追溯记录',
        stance: 'neutral',
        intensity: 0.2,
        evidenceStatus: 'accepted',
        evidenceId: 'ev_drill',
      },
      {
        id: 'finding_communication',
        agentId: 'a5',
        perspective: 'communication',
        content: '客户通知模板已确认',
        stance: 'negative',
        intensity: 0.88,
        evidenceStatus: 'accepted',
        evidenceId: 'ev_notice',
      },
      {
        id: 'finding_practical',
        agentId: 'a6',
        perspective: 'practical',
        content: '库存余量已完成盘点',
        stance: 'positive',
        intensity: 0.52,
        evidenceStatus: 'accepted',
        evidenceId: 'ev_stock',
      },
    ],
    tool_results: [
      {
        ok: true,
        status: 'accepted',
        tool: 'supplier_snapshot',
        riskLevel: 'R1',
        approval: { required: false, approved: false },
        evidence: { id: 'ev_delivery', accepted: true, level: 'E2', payload: { days: 14 } },
      },
      {
        ok: false,
        status: 'approval_required',
        tool: 'replace_supplier',
        riskLevel: 'R3',
        approval: { required: true, approved: false, approvers: ['owner'] },
        evidence: { id: 'ev_replace', accepted: false, level: 'E0' },
      },
    ],
    riskAssessment: { level: 'R3', reasons: ['供应链切换可影响履约'] },
    approvalRequirements: { required: true, approvers: ['owner'], depth: 2 },
  };
}

test('Reflect 用已验证、未知和冲突生成中性 Lens，且不改写证据与安全边界', async () => {
  const session = createSession();
  const immutableBefore = structuredClone({
    tool_results: session.tool_results,
    evidence: session.tool_results.map((item) => item.evidence),
    risks: [session.riskAssessment, ...session.tool_results.map((item) => item.riskLevel)],
    approvals: [session.approvalRequirements, ...session.tool_results.map((item) => item.approval)],
  });

  const result = await reflect(session, {
    callLLMFn: async () => '这是旧的吉凶裁决，可进不宜止。',
    generateMasterSummaryFn: async () => ({
      summary: '旧总结声称宜止',
      options: [{ label: '吉，可进', keyPoints: ['凶则退'], guaRecommendation: '乾' }],
    }),
  });

  assert.equal(result.session.state, 'ORACLE');
  assert.equal(result.replanned, false);
  assert.deepEqual(result.session.tool_results, immutableBefore.tool_results);
  assert.deepEqual(result.session.tool_results.map((item) => item.evidence), immutableBefore.evidence);
  assert.deepEqual(
    [result.session.riskAssessment, ...result.session.tool_results.map((item) => item.riskLevel)],
    immutableBefore.risks,
  );
  assert.deepEqual(
    [result.session.approvalRequirements, ...result.session.tool_results.map((item) => item.approval)],
    immutableBefore.approvals,
  );

  assert.deepEqual(result.oracle.lineMeta.map((line) => line.knowledgeState), [
    'verified', 'contested', 'unknown', 'verified', 'verified', 'verified',
  ]);
  assert.equal(result.oracle.lineMeta.some((line) => Object.hasOwn(line, 'intensity')), false);
  assert.deepEqual(result.oracle.dynamics, [1]);
  assert.ok(result.cognitivePlan.reviewTasks.length > 0);
  assert.deepEqual(result.session.cognitivePlan, result.cognitivePlan);
  assert.deepEqual(result.session.lensImpacts, result.lensImpacts);
  assert.doesNotMatch(result.oracle.text, FORBIDDEN_VERDICT);
  assert.match(result.oracle.text, /审查镜头/);
  assert.doesNotMatch(JSON.stringify({
    oracleText: result.oracle.text,
    cognitivePlan: result.cognitivePlan,
    lensImpacts: result.lensImpacts,
    dynamicChoices: result.session.dynamicChoices,
    masterSummary: result.session.masterSummary,
  }), FORBIDDEN_VERDICT);
});

test('Lens 服务失败时标记本轮禁用，但 Reflect 仍进入 ORACLE', async () => {
  const session = createSession();
  const result = await reflect(session, {
    callLLMFn: async () => { throw new Error('llm unavailable'); },
    generateMasterSummaryFn: async () => ({ options: [], summary: '' }),
    createCognitivePerturbationPlanFn: () => { throw new Error('lens catalog unavailable'); },
  });

  assert.equal(result.session.state, 'ORACLE');
  assert.equal(result.cognitivePlan.status, 'disabled');
  assert.equal(result.cognitivePlan.reason, 'lens-unavailable');
  assert.equal(result.cognitivePlan.message, '本轮未进行认知扰动');
  assert.deepEqual(result.cognitivePlan.reviewTasks, []);
  assert.deepEqual(result.lensImpacts, []);
  assert.deepEqual(result.session.cognitivePlan, result.cognitivePlan);
  assert.doesNotMatch(result.oracle.text, FORBIDDEN_VERDICT);
});

test('mapToHexagram 不会把立场强度当作知识真假', () => {
  const dimensions = [
    { perspective: 'strategic' },
    { perspective: 'risk' },
    { perspective: 'practical' },
  ];
  const aggregated = {
    byPerspective: {
      strategic: {
        findings: [{ id: 'known', evidenceStatus: 'accepted' }],
        overallStance: 'negative',
        avgIntensity: 0.01,
      },
      risk: {
        findings: [{ id: 'unverified', evidenceStatus: 'unknown' }],
        overallStance: 'positive',
        avgIntensity: 0.99,
      },
      practical: {
        findings: [
          { id: 'partly-known', evidenceStatus: 'accepted' },
          { id: 'remaining-unknown', evidenceStatus: 'unknown' },
        ],
        overallStance: 'positive',
        avgIntensity: 0.99,
      },
    },
  };

  const oracle = mapToHexagram(aggregated, dimensions, { conflicts: [], gaps: [] });

  assert.deepEqual(oracle.primary.lines.slice(0, 3), [1, 0, 0]);
  assert.deepEqual(
    oracle.lineMeta.slice(0, 3).map((line) => line.knowledgeState),
    ['verified', 'unknown', 'unknown'],
  );
});

test('Session 投影和 execute 响应保留 Lens 结果，持久化补丁不覆盖 tool_results', async () => {
  assert.equal(typeof deliberationEngine.persistExecuteResult, 'function');
  assert.equal(typeof deliberationEngine.buildExecuteResponse, 'function');
  assert.equal(typeof deliberationEngine.buildResponseFromSession, 'function');

  const session = createSession();
  const cognitivePlan = {
    lensId: 1,
    lensName: '乾',
    source: 'session-derived',
    sourceDigest: 'a'.repeat(64),
    reviewTasks: [],
    invariants: {
      evidenceLocked: true,
      riskLocked: true,
      approvalLocked: true,
      userDecisionLocked: true,
    },
  };
  const lensImpacts = [];
  const result = {
    session: {
      ...session,
      state: 'ORACLE',
      oracle: { text: '本轮审查镜头聚焦已知边界。' },
      cognitivePlan,
      lensImpacts,
    },
    oracle: { text: '本轮审查镜头聚焦已知边界。' },
    conflicts: [],
    gaps: [],
    replanned: false,
    reason: '立卦完成',
    cognitivePlan,
    lensImpacts,
  };
  let persisted;

  await deliberationEngine.persistExecuteResult('sess_cognitive_lens', result, {
    updateSessionStateFn: async (sessionId, state, patch) => {
      persisted = { sessionId, state, patch };
    },
  });

  assert.equal(persisted.sessionId, 'sess_cognitive_lens');
  assert.equal(persisted.state, 'ORACLE');
  assert.deepEqual(persisted.patch.cognitive_plan, cognitivePlan);
  assert.deepEqual(persisted.patch.lens_impacts, lensImpacts);
  assert.equal(Object.hasOwn(persisted.patch, 'tool_results'), false);

  const executeResponse = deliberationEngine.buildExecuteResponse('sess_cognitive_lens', result);
  assert.deepEqual(executeResponse.cognitivePlan, cognitivePlan);
  assert.deepEqual(executeResponse.lensImpacts, lensImpacts);
  const routedAndClientNormalized = normalizeExecuteResponse(executeResponse);
  assert.deepEqual(routedAndClientNormalized.cognitivePlan, cognitivePlan);
  assert.deepEqual(routedAndClientNormalized.lensImpacts, lensImpacts);

  const restoredResponse = deliberationEngine.buildResponseFromSession({
    ...session,
    state: 'ORACLE',
    cognitive_plan: cognitivePlan,
    lens_impacts: lensImpacts,
  });
  assert.deepEqual(restoredResponse.cognitivePlan, cognitivePlan);
  assert.deepEqual(restoredResponse.lensImpacts, lensImpacts);
});

test('PostgreSQL 迁移和 memoryService 映射都持久化 Lens Session 字段', async () => {
  const executedVersions = Array.from({ length: 11 }, (_, index) => String(index + 1).padStart(3, '0'));
  const statements = [];
  const pool = {
    async query(sql, params) {
      if (String(sql).includes('SELECT version FROM migrations')) {
        return { rows: executedVersions.map((version) => ({ version })) };
      }
      statements.push({ sql: String(sql), params });
      return { rows: [] };
    },
  };

  await runMigrations(pool);

  assert.ok(statements.some(({ sql }) => /ADD COLUMN IF NOT EXISTS cognitive_plan JSONB/i.test(sql)));
  assert.ok(statements.some(({ sql }) => /ADD COLUMN IF NOT EXISTS lens_impacts JSONB/i.test(sql)));
  assert.equal(typeof memoryService.toSessionPersistenceData, 'function');
  const mapped = memoryService.toSessionPersistenceData({
    cognitivePlan: { lensId: 1 },
    lensImpacts: [{ taskId: 'lens-task-1' }],
  });
  assert.deepEqual(mapped.cognitive_plan, { lensId: 1 });
  assert.deepEqual(mapped.lens_impacts, [{ taskId: 'lens-task-1' }]);
});
