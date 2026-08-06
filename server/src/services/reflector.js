/**
 * 真 Agent 架构 Step 5: 反思器（Reflector）
 *
 * Reflect 阶段职责（依据 docs/REAL_AGENT_ARCHITECTURE.md 4.3.4 / 5.2 节）:
 *   1. aggregateFindings: 聚合智囊发现 → 按 perspective 分组，提炼立场/强度
 *   2. detectConflicts: 矛盾检测 → 同维度立场对立 / 跨维度对立
 *   3. checkCoverage: 维度覆盖检查 → 找出 plan.dimensions 中无 finding 的维度
 *   4. mapToHexagram: 立卦 → 维度强弱映射八卦阴阳爻 → 主卦/变卦/互卦
 *   5. reflect: 总入口 → 决定 重规划/补维度/立卦
 *
 * 状态流转:
 *   - conflicts > 0 且 replanCount < 1 → state=PLAN (重规划)
 *   - gaps > 0 且 replanCount < 1       → 补维度, state=EXECUTE (重跑智囊)
 *   - 否则                               → 立卦, state=ORACLE
 *
 * Finding 数据契约（execute 阶段产出，reflector 消费）:
 *   { agentId, agentName, perspective, content, stance, intensity, toolUsed? }
 *   stance: 'positive' | 'negative' | 'neutral'
 *   intensity: 0-1
 *
 * 依据: docs/REAL_AGENT_ARCHITECTURE.md 4.3.4 / 5.2 / 6.1 节
 *       docs/REAL_AGENT_FEASIBILITY.md 第 4 节（最小闭环验证）
 */

import logger from './logger.js';
import { callLLM } from './llmRouter.js';
import * as agentEngine from './agentEngine.js';

// ============ 常量 ============

const MAX_REPLAN = 1;

// 八卦维度映射（对齐 REAL_AGENT_ARCHITECTURE.md 5.2 节）
const PERSPECTIVE_TO_TRIGRAM = {
  strategic: { name: '乾', symbol: '☰', lines: [1, 1, 1] },     // 天
  communication: { name: '兑', symbol: '☱', lines: [1, 1, 0] },  // 泽
  emotional: { name: '离', symbol: '☲', lines: [1, 0, 1] },     // 火
  action: { name: '震', symbol: '☳', lines: [0, 0, 1] },         // 雷
  experience: { name: '巽', symbol: '☴', lines: [1, 1, 0] },     // 风（注:巽下断，lines从底到上[1,1,0]）
  risk: { name: '坎', symbol: '☵', lines: [0, 1, 0] },           // 水
  practical: { name: '艮', symbol: '☶', lines: [1, 0, 0] },      // 山
  health: { name: '坤', symbol: '☷', lines: [0, 0, 0] },         // 地
};

// 维度兼容性（用于跨维度矛盾检测）：对立维度对
const OPPOSING_PERSPECTIVES = [
  ['action', 'reflection'],     // 动 vs 思
  ['strategic', 'practical'],   // 远 vs 近
  ['emotional', 'risk'],        // 情 vs 理
];

// ============ 1. 聚合智囊发现 ============

/**
 * 按 perspective 聚合 findings，提炼每维度的总体立场与强度
 * @param {Array} findings Finding 对象数组
 * @param {Array} toolResults 演侧工具结果（可选，作为天机旁证）
 * @returns {Object} { byPerspective: { [perspective]: { findings, overallStance, avgIntensity, count } }, summary }
 */
export function aggregateFindings(findings, toolResults = []) {
  const byPerspective = {};
  const safeFindings = Array.isArray(findings) ? findings : [];

  for (const f of safeFindings) {
    if (!f || !f.perspective) continue;
    if (!byPerspective[f.perspective]) {
      byPerspective[f.perspective] = {
        findings: [],
        stances: [],
        intensities: [],
      };
    }
    byPerspective[f.perspective].findings.push(f);
    byPerspective[f.perspective].stances.push(f.stance || 'neutral');
    byPerspective[f.perspective].intensities.push(Number(f.intensity) || 0.5);
  }

  // 计算每维度总体立场与平均强度
  const result = {};
  for (const [perspective, data] of Object.entries(byPerspective)) {
    const pos = data.stances.filter((s) => s === 'positive').length;
    const neg = data.stances.filter((s) => s === 'negative').length;
    const overallStance = pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral';
    const avgIntensity = data.intensities.reduce((a, b) => a + b, 0) / data.intensities.length;
    result[perspective] = {
      findings: data.findings,
      overallStance,
      avgIntensity,
      count: data.findings.length,
    };
  }

  const summary = {
    totalFindings: safeFindings.length,
    perspectivesCovered: Object.keys(result),
    toolProbeCount: Array.isArray(toolResults) ? toolResults.length : 0,
  };

  logger.info('[Reflector] 聚合完成', {
    totalFindings: summary.totalFindings,
    perspectives: summary.perspectivesCovered,
    toolProbes: summary.toolProbeCount,
  });

  return { byPerspective: result, summary };
}

// ============ 2. 矛盾检测 ============

/**
 * 检测智囊发现中的矛盾
 *  - 同维度内部矛盾：同 perspective 下正负立场并存且强度都>0.6
 *  - 跨维度对立：OPPOSING_PERSPECTIVES 中双方立场极端对立（一方 positive 一方 negative，强度都>0.7）
 * @param {Array} findings
 * @returns {Array} conflicts: [{ type, perspective, detail }]
 */
export function detectConflicts(findings) {
  const conflicts = [];
  const safeFindings = Array.isArray(findings) ? findings : [];
  if (safeFindings.length < 2) return conflicts;

  const { byPerspective } = aggregateFindings(safeFindings);

  // (a) 同维度内部矛盾
  for (const [perspective, data] of Object.entries(byPerspective)) {
    if (data.count < 2) continue;
    const pos = data.findings.filter((f) => f.stance === 'positive' && f.intensity > 0.6);
    const neg = data.findings.filter((f) => f.stance === 'negative' && f.intensity > 0.6);
    if (pos.length > 0 && neg.length > 0) {
      conflicts.push({
        type: 'intra_perspective',
        perspective,
        detail: `${perspective} 维度内部分歧：${pos.length}方支持 vs ${neg.length}方反对`,
      });
    }
  }

  // (b) 跨维度对立
  for (const [a, b] of OPPOSING_PERSPECTIVES) {
    const da = byPerspective[a];
    const db = byPerspective[b];
    if (!da || !db) continue;
    if (
      da.overallStance === 'positive' && db.overallStance === 'negative' &&
      da.avgIntensity > 0.7 && db.avgIntensity > 0.7
    ) {
      conflicts.push({
        type: 'cross_perspective',
        perspective: `${a} vs ${b}`,
        detail: `${a}主张行动而${b}主张谨慎，立场极端对立`,
      });
    } else if (
      da.overallStance === 'negative' && db.overallStance === 'positive' &&
      da.avgIntensity > 0.7 && db.avgIntensity > 0.7
    ) {
      conflicts.push({
        type: 'cross_perspective',
        perspective: `${a} vs ${b}`,
        detail: `${b}主张行动而${a}主张谨慎，立场极端对立`,
      });
    }
  }

  logger.info('[Reflector] 矛盾检测', { conflictCount: conflicts.length, conflicts });
  return conflicts;
}

// ============ 3. 维度覆盖检查 ============

/**
 * 检查 plan.dimensions 中哪些 perspective 没有 finding 覆盖
 * @param {Array} dimensions plan.dimensions
 * @param {Array} findings
 * @returns {Array} gaps: [{ name, perspective }] 缺失的维度
 */
export function checkCoverage(dimensions, findings) {
  const safeDims = Array.isArray(dimensions) ? dimensions : [];
  const safeFindings = Array.isArray(findings) ? findings : [];
  const covered = new Set(safeFindings.map((f) => f.perspective).filter(Boolean));

  const gaps = safeDims
    .filter((d) => d && d.perspective && !covered.has(d.perspective))
    .map((d) => ({ name: d.name || d.perspective, perspective: d.perspective }));

  logger.info('[Reflector] 覆盖检查', {
    totalDims: safeDims.length,
    coveredCount: covered.size,
    gapCount: gaps.length,
    gaps: gaps.map((g) => g.perspective),
  });
  return gaps;
}

// ============ 4. 立卦 ============

/**
 * 根据各维度强弱生成主卦/变卦/互卦
 *
 * 算法（简化版，确定性映射，非随机起卦）:
 *   - 从 plan.dimensions 取最多6个维度，按顺序对应6爻（初爻→上爻）
 *   - 每维度 avgIntensity:
 *       > 0.6  → 阳爻 (1)
 *       < 0.4  → 阴爻 (0)
 *       0.4-0.6 → 动爻（阳变阴或阴变阳，记为动）
 *   - 主卦: 6 爻组合
 *   - 变卦: 动爻阴阳互换后的 6 爻
 *   - 互卦: 取主卦 2,3,4 爻为下卦，3,4,5 爻为上卦
 *
 * @param {Object} aggregated aggregateFindings 的结果
 * @param {Array} dimensions plan.dimensions
 * @returns {Object} { primary: {lines, trigrams}, changed: {...}, mutual: {...}, dynamics: [动爻位] }
 */
export function mapToHexagram(aggregated, dimensions) {
  const safeDims = Array.isArray(dimensions) ? dimensions.slice(0, 6) : [];
  const { byPerspective } = aggregated;

  // 生成6爻（不足6个维度时用默认值0.5）
  const lines = []; // 0=阴 1=阳
  const dynamics = []; // 动爻位置（0-5）
  const lineMeta = []; // 每爻的维度信息

  for (let i = 0; i < 6; i++) {
    const dim = safeDims[i];
    const perspective = dim?.perspective || `pos_${i}`;
    const data = byPerspective[perspective];
    const intensity = data ? data.avgIntensity : 0.5;

    let isYang;
    if (intensity > 0.6) {
      isYang = true;
    } else if (intensity < 0.4) {
      isYang = false;
    } else {
      // 中间区 → 动爻：强度偏高取阳动，偏低取阴动
      isYang = intensity >= 0.5;
      dynamics.push(i);
    }
    lines.push(isYang ? 1 : 0);
    lineMeta.push({ position: i, perspective, intensity, isYang, isDynamic: dynamics.includes(i) });
  }

  // 主卦：下卦（初二三）+ 上卦（四五上）
  const primary = buildHexagramFromLines(lines);

  // 变卦：动爻阴阳互换
  const changedLines = lines.map((l, i) => (dynamics.includes(i) ? (l === 1 ? 0 : 1) : l));
  const changed = buildHexagramFromLines(changedLines);

  // 互卦：取主卦 2,3,4 爻为下卦，3,4,5 爻为上卦（索引1,2,3 + 2,3,4）
  const mutualLines = [lines[1], lines[2], lines[3], lines[2], lines[3], lines[4]];
  const mutual = buildHexagramFromLines(mutualLines);

  logger.info('[Reflector] 立卦完成', {
    primary: primary.lines.join(''),
    changed: changed.lines.join(''),
    mutual: mutual.lines.join(''),
    dynamics,
    lineMeta: lineMeta.map((m) => `${m.perspective}:${m.intensity.toFixed(2)}(${m.isYang ? '阳' : '阴'}${m.isDynamic ? '动' : ''})`),
  });

  return {
    primary,
    changed,
    mutual,
    dynamics,
    lineMeta,
  };
}

/**
 * 从6爻lines数组构建卦象信息
 * lines 顺序：初爻(底) → 上爻(顶)，lines[0]=初爻
 */
function buildHexagramFromLines(lines) {
  const lower = lines.slice(0, 3); // 下卦
  const upper = lines.slice(3, 6); // 上卦
  // 找最匹配的八卦
  const lowerTrigram = matchTrigram(lower);
  const upperTrigram = matchTrigram(upper);
  return {
    lines: lines.slice(),
    lower: lowerTrigram,
    upper: upperTrigram,
    binaryKey: lines.reduce((acc, l, i) => acc | (l << i), 0),
  };
}

function matchTrigram(lines3) {
  // lines3: [初, 中, 上] 3爻
  // PERSPECTIVE_TO_TRIGRAM.lines 也是 [底, 中, 顶]
  for (const [key, val] of Object.entries(PERSPECTIVE_TO_TRIGRAM)) {
    if (val.lines[0] === lines3[0] && val.lines[1] === lines3[1] && val.lines[2] === lines3[2]) {
      return { name: val.name, symbol: val.symbol, perspective: key };
    }
  }
  // 兜底
  return { name: '?', symbol: '?', perspective: 'unknown' };
}

// ============ 5. LLM 卦辞生成（可选增强） ============

/**
 * 调 LLM 生成卦辞与建议（失败降级为聚合摘要）
 * @param {Object} oracle mapToHexagram 结果
 * @param {Object} aggregated
 * @param {string} question
 * @returns {Promise<string>} 卦辞文本
 */
async function generateOracleText(oracle, aggregated, question) {
  const dimSummary = Object.entries(aggregated.byPerspective)
    .map(([p, d]) => `${p}(${d.overallStance},${d.avgIntensity.toFixed(2)})`)
    .join(' ');

  const primaryName = `${oracle.primary.lower.name}${oracle.primary.upper.name}`;
  const changedName = `${oracle.changed.lower.name}${oracle.changed.upper.name}`;
  const dynamicStr = oracle.dynamics.length > 0
    ? `${oracle.dynamics.map((i) => i + 1).join('、')}爻动`
    : '无动爻';

  const stances = Object.entries(aggregated.byPerspective);
  const posCount = stances.filter(([, d]) => d.overallStance === 'positive').length;
  const negCount = stances.filter(([, d]) => d.overallStance === 'negative').length;
  const allFindings = stances.map(([p, d]) => {
    const findingTexts = d.findings.map(f => f.content || f.text || '').filter(Boolean).slice(0, 2);
    return `${p}(${d.overallStance === 'positive' ? '吉' : d.overallStance === 'negative' ? '凶' : '平'}): ${findingTexts.join('；')}`;
  }).join(' | ');

  try {
    const result = await Promise.race([
      callLLM(
        [
          {
            role: 'system',
            content: `你是「演」的卦象解读。用文言八卦风格解读卦象，赛博算命感。
格式要求：
1. 开头用"【${primaryName}卦】"
2. 简述各维度吉凶（2-3句）
3. 核心判断（1-2句，如"此卦利动不利守"或"时机未到"）
4. 一句卦辞总结（仿周易风格，7-14字）
5. 结尾用"⚠️"标注注意事项
字数控制在80-120字。`,
          },
          {
            role: 'user',
            content: `问题：${question}
主卦：${primaryName}（${dynamicStr}）
变卦：${changedName}
维度分析：${dimSummary}
吉凶统计：吉${posCount}/凶${negCount}
智囊发现：${allFindings}

请解读此卦。`,
          },
        ],
        { maxTokens: 200, temperature: 0.8 }
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);

    if (result && result.trim()) {
      logger.info(`[OracleText] LLM生成成功`);
      return result.trim();
    }
  } catch (e) {
    logger.info(`[OracleText] LLM超时/失败, 降级模板: ${e.message}`);
  }

  // 降级：规则生成
  let interpretation;
  if (posCount > negCount) {
    interpretation = '诸象偏吉，机不可失，然需防盛极而衰。';
  } else if (negCount > posCount) {
    interpretation = '诸象偏凶，宜守不宜进，静待时机。';
  } else {
    interpretation = '吉凶参半，需权衡利弊，顺势而为。';
  }
  const advice = oracle.dynamics.length > 0
    ? `动爻在${oracle.dynamics.map((i) => i + 1).join('、')}位，变机已现，${posCount >= negCount ? '可进' : '宜止'}。`
    : '无动爻，局势稳定，从长计议。';

  return `${primaryName}·${dynamicStr}。${interpretation}${advice}`;
}

// ============ 6. 总入口 ============

/**
 * Reflect 阶段总入口
 *
 * 流程:
 *   1. 聚合 findings
 *   2. 矛盾检测 → 有矛盾且可重规划 → state=PLAN
 *   3. 覆盖检查 → 有缺口且可重规划 → 补维度, state=EXECUTE
 *   4. 立卦 + 生成卦辞 → state=ORACLE
 *
 * @param {object} session 推演会话（需含 plan.dimensions, findings, replan_count）
 * @returns {Promise<{session, oracle, conflicts, gaps, aggregated, replanned}>}
 */
export async function reflect(session) {
  logger.info('[Reflector] reflect 开始', {
    sessionId: session?.id,
    findingsCount: (session?.findings || []).length,
    replanCount: session?.replan_count || 0,
  });

  const findings = Array.isArray(session?.findings) ? session.findings : [];
  const dimensions = session?.plan?.dimensions || [];
  const toolResults = session?.tool_results || session?.toolResults || [];
  const replanCount = Number(session?.replan_count) || 0;

  // 1. 聚合
  const aggregated = aggregateFindings(findings, toolResults);

  // 2. 矛盾检测
  const conflicts = detectConflicts(findings);
  if (conflicts.length > 0 && replanCount < MAX_REPLAN) {
    session.replan_count = replanCount + 1;
    session.state = 'PLAN';
    logger.info('[Reflector] 触发重规划（矛盾）', {
      replanCount: session.replan_count,
      conflictCount: conflicts.length,
      firstConflict: conflicts[0],
    });
    return {
      session,
      oracle: null,
      conflicts,
      gaps: [],
      aggregated,
      replanned: true,
      reason: '矛盾触发重规划',
    };
  }

  // 3. 覆盖检查
  const gaps = checkCoverage(dimensions, findings);
  if (gaps.length > 0 && replanCount < MAX_REPLAN) {
    // 补维度，回到 EXECUTE 重跑智囊
    session.replan_count = replanCount + 1;
    session.plan.dimensions = [...dimensions, ...gaps.map((g) => ({ name: g.name, perspective: g.perspective, agents: [], toolNeeds: [] }))];
    session.state = 'EXECUTE';
    logger.info('[Reflector] 补维度重跑（覆盖不足）', {
      replanCount: session.replan_count,
      gapCount: gaps.length,
      addedPerspectives: gaps.map((g) => g.perspective),
    });
    return {
      session,
      oracle: null,
      conflicts,
      gaps,
      aggregated,
      replanned: true,
      reason: '维度缺口补全',
    };
  }

  // 4. 立卦
  const oracle = mapToHexagram(aggregated, dimensions);
  oracle.text = await generateOracleText(oracle, aggregated, session?.question || '');
  oracle.conflicts = conflicts;
  oracle.gaps = gaps;

  // P1-1：基于智囊发现，LLM动态生成抉择选项（不再固定4个）
  let dynamicChoices = [];
  let masterSummaryText = '';
  try {
    const agentIds = Array.from(new Set(findings.map(f => f.agentId).filter(Boolean)));
    const dialogueHistory = {};
    findings.forEach(f => {
      if (!f.agentId) return;
      if (!dialogueHistory[f.agentId]) dialogueHistory[f.agentId] = [];
      if (f.content) dialogueHistory[f.agentId].push(f.content);
    });
    const ms = await agentEngine.generateMasterSummary(
      session?.questionContext || session?.question || '',
      agentIds,
      dialogueHistory
    );
    if (ms && Array.isArray(ms.options) && ms.options.length > 0) {
      // 映射成前端Game.jsx需要的 {id,label,color,icon,gua,keyPoints} 格式
      const palette = [
        { color: '#E8B880', icon: '☰', gua: '大有' },
        { color: '#E88080', icon: '☵', gua: '坎' },
        { color: '#80C8A8', icon: '☶', gua: '艮' },
        { color: '#D8A8C8', icon: '☴', gua: '巽' },
        { color: '#A8C0E8', icon: '☳', gua: '解' },
        { color: '#E8D080', icon: '☲', gua: '离' },
      ];
      dynamicChoices = ms.options.map((opt, idx) => {
        const pick = palette[idx % palette.length];
        return {
          id: `dyn_${idx}_${Date.now().toString(36)}`,
          label: String(opt.label || `选项${idx + 1}`).slice(0, 10),
          color: pick.color,
          glowColor: pick.color,
          icon: opt.guaRecommendation ? (opt.guaRecommendation.slice(0, 1) || pick.icon) : pick.icon,
          gua: opt.guaRecommendation || pick.gua,
          keyPoints: Array.isArray(opt.keyPoints) ? opt.keyPoints.slice(0, 3) : [],
          isDynamic: true,
        };
      });
      masterSummaryText = ms.summary || '';
      logger.info('[Reflector] 动态抉择选项生成', { sessionId: session?.id, count: dynamicChoices.length });
    }
  } catch (e) {
    logger.warn('[Reflector] 动态选项生成失败（不阻塞立卦）', { sessionId: session?.id, error: e.message });
    dynamicChoices = [];
  }

  session.oracle = oracle;
  session.dynamicChoices = dynamicChoices;
  session.masterSummary = masterSummaryText;
  session.state = 'ORACLE';

  logger.info('[Reflector] reflect 完成 → ORACLE', {
    sessionId: session?.id,
    primary: `${oracle.primary.lower.name}${oracle.primary.upper.name}`,
    changed: `${oracle.changed.lower.name}${oracle.changed.upper.name}`,
    dynamics: oracle.dynamics,
    oracleText: oracle.text.slice(0, 60),
  });

  return {
    session,
    oracle,
    conflicts,
    gaps,
    aggregated,
    replanned: false,
    reason: '立卦完成',
  };
}

// ============ 自检 ============

/**
 * 自检：用 mock findings 测试 reflector 全流程
 *
 * 跑法: cd server && node --input-type=module -e "import('./src/services/reflector.js').then(m=>m.selfTest())"
 */
export async function selfTest() {
  logger.info('=== Reflector selfTest 开始 ===');

  // 场景1: 无矛盾、覆盖完整 → 应立卦
  const session1 = {
    id: 'selftest_1',
    question: '我要不要去西藏',
    replan_count: 0,
    plan: {
      dimensions: [
        { name: '风险维度', perspective: 'risk' },
        { name: '健康维度', perspective: 'health' },
        { name: '体验维度', perspective: 'experience' },
        { name: '反思维度', perspective: 'reflection' },
      ],
    },
    findings: [
      { agentId: 'fengyan', agentName: '风眼', perspective: 'risk', content: '高原反应风险高', stance: 'negative', intensity: 0.8 },
      { agentId: 'yangsheng', agentName: '养生', perspective: 'health', content: '身体条件允许', stance: 'positive', intensity: 0.7 },
      { agentId: 'luyou', agentName: '远足', perspective: 'experience', content: '体验极佳', stance: 'positive', intensity: 0.9 },
      { agentId: 'jingyuan', agentName: '镜渊', perspective: 'reflection', content: '此行有意义', stance: 'positive', intensity: 0.6 },
    ],
  };

  const result1 = await reflect(session1);
  const ok1 =
    result1.session.state === 'ORACLE' &&
    !!result1.oracle &&
    !!result1.oracle.primary &&
    !!result1.oracle.text &&
    result1.replanned === false;

  logger.info('=== Reflector selfTest 场景1（立卦）===', {
    ok: ok1,
    state: result1.session.state,
    primary: `${result1.oracle?.primary.lower.name}${result1.oracle?.primary.upper.name}`,
    changed: `${result1.oracle?.changed.lower.name}${result1.oracle?.changed.upper.name}`,
    oracleText: result1.oracle?.text,
  });

  if (!ok1) {
    throw new Error(`selfTest 场景1失败：state=${result1.session.state}, oracle=${!!result1.oracle}`);
  }

  // 场景2: 同维度内部矛盾 → 应触发重规划
  const session2 = {
    id: 'selftest_2',
    question: '要不要辞职',
    replan_count: 0,
    plan: {
      dimensions: [
        { name: '风险维度', perspective: 'risk' },
        { name: '行动维度', perspective: 'action' },
      ],
    },
    findings: [
      { agentId: 'a1', agentName: '智囊A', perspective: 'risk', content: '风险大', stance: 'negative', intensity: 0.9 },
      { agentId: 'a2', agentName: '智囊B', perspective: 'risk', content: '风险可控', stance: 'positive', intensity: 0.7 },
    ],
  };

  const result2 = await reflect(session2);
  const ok2 =
    result2.session.state === 'PLAN' &&
    result2.replanned === true &&
    result2.session.replan_count === 1 &&
    result2.conflicts.length > 0;

  logger.info('=== Reflector selfTest 场景2（矛盾重规划）===', {
    ok: ok2,
    state: result2.session.state,
    replanCount: result2.session.replan_count,
    conflicts: result2.conflicts,
  });

  if (!ok2) {
    throw new Error(`selfTest 场景2失败：state=${result2.session.state}, replanCount=${result2.session.replan_count}`);
  }

  // 场景3: 覆盖不足 → 应补维度重跑
  const session3 = {
    id: 'selftest_3',
    question: '要不要接 offer',
    replan_count: 0,
    plan: {
      dimensions: [
        { name: '风险维度', perspective: 'risk' },
        { name: '财务维度', perspective: 'financial' },
        { name: '反思维度', perspective: 'reflection' },
      ],
    },
    findings: [
      { agentId: 'fengyan', agentName: '风眼', perspective: 'risk', content: '公司有诉讼', stance: 'negative', intensity: 0.8 },
    ],
  };

  const result3 = await reflect(session3);
  const ok3 =
    result3.session.state === 'EXECUTE' &&
    result3.replanned === true &&
    result3.gaps.length > 0 &&
    result3.session.plan.dimensions.length >= 3;

  logger.info('=== Reflector selfTest 场景3（补维度重跑）===', {
    ok: ok3,
    state: result3.session.state,
    replanCount: result3.session.replan_count,
    gaps: result3.gaps,
    newDimCount: result3.session.plan.dimensions.length,
  });

  if (!ok3) {
    throw new Error(`selfTest 场景3失败：state=${result3.session.state}, gaps=${result3.gaps.length}`);
  }

  logger.info('=== Reflector selfTest 全部通过 ===');
  return { ok: true, scenario1: ok1, scenario2: ok2, scenario3: ok3 };
}

export default {
  aggregateFindings,
  detectConflicts,
  checkCoverage,
  mapToHexagram,
  reflect,
  selfTest,
};
