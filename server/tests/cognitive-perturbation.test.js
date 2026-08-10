import test from 'node:test';
import assert from 'node:assert/strict';

import { HEXAGRAM_LENSES } from '../src/data/hexagramLenses.js';
import {
  createCognitivePerturbationPlan,
  createLensImpactRecords,
} from '../src/services/cognitivePerturbationService.js';

const source = {
  oracle: {
    primary: { binaryKey: 0 },
    dynamics: [2],
  },
  findings: [
    { id: 'finding_known', perspective: 'risk', content: '已有报价记录', evidenceStatus: 'accepted' },
    { id: 'finding_unknown', perspective: 'cost', content: '成本上限未知', evidenceStatus: 'unknown' },
  ],
  conflicts: [{ id: 'conflict_margin', reason: '毛利假设与报价记录不一致' }],
  gaps: [{ id: 'gap_cost', perspective: 'cost', name: '成本' }],
  dimensions: [{ perspective: 'risk' }, { perspective: 'cost' }],
  sessionSeed: 'session-06-seed',
};

test('64 卦 Lens 目录完整、唯一且不含行动裁决', () => {
  assert.equal(HEXAGRAM_LENSES.length, 64);
  assert.equal(new Set(HEXAGRAM_LENSES.map((lens) => lens.hexagramId)).size, 64);
  assert.equal(new Set(HEXAGRAM_LENSES.map((lens) => lens.name)).size, 64);
  assert.equal(new Set(HEXAGRAM_LENSES.map((lens) => lens.themes.join('|'))).size, 64);

  for (const lens of HEXAGRAM_LENSES) {
    assert.deepEqual(Object.keys(lens).sort(), [
      'counterfactualPrompts',
      'exitConditions',
      'failureModes',
      'forbiddenUses',
      'hexagramId',
      'name',
      'reviewQuestions',
      'themes',
    ]);
    for (const field of ['themes', 'reviewQuestions', 'failureModes', 'counterfactualPrompts', 'exitConditions', 'forbiddenUses']) {
      assert.ok(Array.isArray(lens[field]) && lens[field].length > 0, `${lens.name}.${field}`);
    }
    assert.match(lens.forbiddenUses.join(''), /不得.*(事实|风险|审批|决定)/);
    assert.doesNotMatch(
      [...lens.reviewQuestions, ...lens.failureModes, ...lens.counterfactualPrompts, ...lens.exitConditions].join(''),
      /(吉|凶|可进|宜止|立即执行|批准执行|命运)/,
    );
  }
});

test('相同输入会生成同一摘要、Lens 与任务，并锁定四项不可变量', () => {
  const first = createCognitivePerturbationPlan(source);
  const second = createCognitivePerturbationPlan(structuredClone(source));

  assert.deepEqual(first, second);
  assert.match(first.sourceDigest, /^[a-f0-9]{64}$/);
  assert.equal(first.source, 'session-derived');
  assert.deepEqual(first.invariants, {
    evidenceLocked: true,
    riskLocked: true,
    approvalLocked: true,
    userDecisionLocked: true,
  });
});

test('binaryKey 使用文王卦序映射而不是数值加一', () => {
  const allYin = createCognitivePerturbationPlan({ ...source, oracle: { primary: { binaryKey: 0 } } });
  const allYang = createCognitivePerturbationPlan({ ...source, oracle: { primary: { binaryKey: 63 } } });

  assert.equal(allYin.lensId, 2);
  assert.equal(allYin.lensName, '坤');
  assert.equal(allYang.lensId, 1);
  assert.equal(allYang.lensName, '乾');
});

test('全部 64 个 binaryKey 按文王卦序映射到固定 Lens', () => {
  const cases = [
    [0, 2, '坤'], [1, 24, '复'], [2, 7, '师'], [3, 19, '临'],
    [4, 15, '谦'], [5, 36, '明夷'], [6, 46, '升'], [7, 11, '泰'],
    [8, 16, '豫'], [9, 51, '震'], [10, 40, '解'], [11, 54, '归妹'],
    [12, 62, '小过'], [13, 55, '丰'], [14, 32, '恒'], [15, 34, '大壮'],
    [16, 8, '比'], [17, 3, '屯'], [18, 29, '坎'], [19, 60, '节'],
    [20, 39, '蹇'], [21, 63, '既济'], [22, 48, '井'], [23, 5, '需'],
    [24, 45, '萃'], [25, 17, '随'], [26, 47, '困'], [27, 58, '兑'],
    [28, 31, '咸'], [29, 49, '革'], [30, 28, '大过'], [31, 43, '夬'],
    [32, 23, '剥'], [33, 27, '颐'], [34, 4, '蒙'], [35, 41, '损'],
    [36, 52, '艮'], [37, 22, '贲'], [38, 18, '蛊'], [39, 26, '大畜'],
    [40, 35, '晋'], [41, 21, '噬嗑'], [42, 64, '未济'], [43, 38, '睽'],
    [44, 56, '旅'], [45, 30, '离'], [46, 50, '鼎'], [47, 14, '大有'],
    [48, 20, '观'], [49, 42, '益'], [50, 59, '涣'], [51, 61, '中孚'],
    [52, 53, '渐'], [53, 37, '家人'], [54, 57, '巽'], [55, 9, '小畜'],
    [56, 12, '否'], [57, 25, '无妄'], [58, 6, '讼'], [59, 10, '履'],
    [60, 33, '遁'], [61, 13, '同人'], [62, 44, '姤'], [63, 1, '乾'],
  ];

  for (const [binaryKey, lensId, lensName] of cases) {
    const plan = createCognitivePerturbationPlan({
      ...source,
      oracle: { primary: { binaryKey } },
    });
    assert.deepEqual(
      [plan.lensId, plan.lensName],
      [lensId, lensName],
      `binaryKey=${binaryKey}`,
    );
  }
});

test('语义相同但键插入顺序不同的输入生成同一计划', () => {
  const reordered = {
    sessionSeed: 'session-06-seed',
    dimensions: [{ perspective: 'risk' }, { perspective: 'cost' }],
    gaps: [{ name: '成本', perspective: 'cost', id: 'gap_cost' }],
    conflicts: [{ reason: '毛利假设与报价记录不一致', id: 'conflict_margin' }],
    findings: [
      { evidenceStatus: 'accepted', content: '已有报价记录', perspective: 'risk', id: 'finding_known' },
      { evidenceStatus: 'unknown', content: '成本上限未知', perspective: 'cost', id: 'finding_unknown' },
    ],
    oracle: {
      dynamics: [2],
      primary: { binaryKey: 0 },
    },
  };

  assert.deepEqual(createCognitivePerturbationPlan(source), createCognitivePerturbationPlan(reordered));
});

test('事实、冲突、缺口和维度作为语义集合重排时摘要与任务保持稳定', () => {
  const semanticSource = structuredClone(source);
  semanticSource.conflicts.push({ id: 'conflict_timing', reason: '时间窗口存在分歧', perspective: 'risk' });
  semanticSource.gaps.push({ id: 'gap_timing', perspective: 'strategic', name: '时间窗口' });
  const reorderedCollections = structuredClone(semanticSource);
  reorderedCollections.findings.reverse();
  reorderedCollections.conflicts.reverse();
  reorderedCollections.gaps.reverse();
  reorderedCollections.dimensions.reverse();

  assert.deepEqual(
    createCognitivePerturbationPlan(semanticSource),
    createCognitivePerturbationPlan(reorderedCollections),
  );
});

test('扰动计划保存六爻形成信息且保持初爻到上爻顺序', () => {
  const input = structuredClone(source);
  input.oracle = {
    ...input.oracle,
    primary: {
      binaryKey: 21,
      lower: { name: '离<script>', symbol: '☲', privateNote: '不得暴露' },
      upper: { name: '坎', symbol: '☵' },
      lines: [1, 0, 1, 0, 1, 0],
    },
    changed: {
      lower: { name: '乾', symbol: '☰' },
      upper: { name: '坤', symbol: '☷' },
      lines: [1, 1, 1, 0, 0, 0],
    },
    lineMeta: [
      { position: 0, perspective: 'strategic', knowledgeState: 'verified', isYang: true, isDynamic: false, privateText: 'secret' },
      { position: 1, perspective: 'risk', knowledgeState: 'contested', isYang: false, isDynamic: true },
      { position: 2, perspective: 'financial', knowledgeState: 'unknown', isYang: true, isDynamic: false },
      { position: 3, perspective: 'action', knowledgeState: 'verified', isYang: false, isDynamic: false },
      { position: 4, perspective: 'communication', knowledgeState: 'unknown', isYang: true, isDynamic: false },
      { position: 5, perspective: 'practical', knowledgeState: 'verified', isYang: false, isDynamic: false },
    ],
  };

  const plan = createCognitivePerturbationPlan(input);

  assert.deepEqual(plan.formation, {
    primary: { lowerTrigram: '?', upperTrigram: '坎' },
    changed: { lowerTrigram: '乾', upperTrigram: '坤' },
    lines: [
      { position: 1, yinYang: 'yang', knowledgeState: 'verified', perspective: 'strategic', dynamic: false },
      { position: 2, yinYang: 'yin', knowledgeState: 'contested', perspective: 'risk', dynamic: true },
      { position: 3, yinYang: 'yang', knowledgeState: 'unknown', perspective: 'financial', dynamic: false },
      { position: 4, yinYang: 'yin', knowledgeState: 'verified', perspective: 'action', dynamic: false },
      { position: 5, yinYang: 'yang', knowledgeState: 'unknown', perspective: 'communication', dynamic: false },
      { position: 6, yinYang: 'yin', knowledgeState: 'verified', perspective: 'practical', dynamic: false },
    ],
  });
  assert.doesNotMatch(JSON.stringify(plan.formation), /privateNote|privateText|secret|symbol/);
});

test('扰动计划最多三项且每项可追溯到 Lens 和原始未知或冲突', () => {
  const plan = createCognitivePerturbationPlan(source);

  assert.ok(plan.reviewTasks.length > 0 && plan.reviewTasks.length <= 3);
  for (const task of plan.reviewTasks) {
    assert.match(task.id, /^lens-task-[a-f0-9]{16}-[1-3]$/);
    assert.ok(['assumption', 'failure-mode', 'counterfactual', 'exit-condition'].includes(task.kind));
    assert.ok(task.question.length > 0);
    assert.ok(task.causedBy.length > 1);
    assert.ok(task.causedBy.includes(`lens:${plan.lensId}`));
    assert.ok(task.causedBy.some((sourceId) => sourceId.startsWith('conflict:') || sourceId.startsWith('gap:')));
    assert.doesNotMatch(task.question, /(吉|凶|可进|宜止|立即执行|批准执行|命运)/);
  }
});

test('未知 finding 不会被升级为事实或被扰动计划修改', () => {
  const input = structuredClone(source);
  const before = structuredClone(input);
  const plan = createCognitivePerturbationPlan(input);

  assert.deepEqual(input, before);
  assert.equal(input.findings[1].evidenceStatus, 'unknown');
  assert.doesNotMatch(JSON.stringify(plan), /已验证事实/);
});

test('影响记录只保留有实际关联 finding 的可证明结果', () => {
  const plan = createCognitivePerturbationPlan(source);
  const [firstTask] = plan.reviewTasks;
  const records = createLensImpactRecords(plan, [
    { id: 'finding_added', lensTaskId: firstTask.id, evidenceId: 'ev_1', evidenceStatus: 'accepted', content: '补充了报价证据' },
    { id: 'finding_unrelated', lensTaskId: 'missing_task', content: '无关联' },
  ]);

  assert.equal(records.length, 1);
  assert.deepEqual(records[0].findingIds, ['finding_added']);
  assert.equal(records[0].outcome, 'evidence-added');
});

test('未知状态的关联证据不会被升级为 evidence-added', () => {
  const plan = createCognitivePerturbationPlan(source);
  const [firstTask] = plan.reviewTasks;
  const records = createLensImpactRecords(plan, [
    {
      id: 'finding_unverified',
      lensTaskId: firstTask.id,
      evidenceStatus: 'unknown',
      evidence: '未经核验的说法',
    },
  ]);

  assert.deepEqual(records, []);
});
