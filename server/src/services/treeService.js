/**
 * LLM 动态决策树生成（半动态方案）
 *
 * 核心思路：结构骨架固定（保证前端渲染稳定），内容完全 LLM 生成（保证通用性）
 * - LLM 只生成：维度标签/描述、命牌文案、分支标签
 * - 服务器填充：节点 id/position/topology/branches 结构
 *
 * 这样 LLM 调用轻量（prompt 短、response 小），成功率高，且任意问题都能处理
 */

import { callLLM } from './llmRouter.js';

/**
 * 根据信息完整度决定维度数量
 */
function decideDimCount(completeness) {
  if (typeof completeness !== 'number') return 3;
  if (completeness < 0.6) return 2;
  if (completeness < 0.8) return 3;
  return 4;
}

/**
 * 维度节点的 x 坐标分布（保证视觉均匀）
 */
function getDimXPositions(count) {
  switch (count) {
    case 2: return [0.3, 0.7];
    case 3: return [0.17, 0.5, 0.83];
    case 4: return [0.1, 0.37, 0.63, 0.9];
    default: return [0.17, 0.5, 0.83];
  }
}

/**
 * 调用 LLM 只生成动态内容（轻量 prompt，高成功率）
 *
 * @param {string} question 用户问题
 * @param {number} dimCount 维度数量
 * @param {object} intent 意图特征
 * @param {string} userMemory 用户记忆
 * @returns {Promise<object|null>} { dimensions, fateAccept, fateReject, crossroadLabels }
 */
async function generateDynamicContent(question, dimCount, intent, userMemory) {
  // 拆成两次 LLM 调用，每次只生成一部分，提高成功率和质量

  // === 第一次调用：维度 + 路口标签 ===
  const dimPrompt = `生成${dimCount}个决策维度的内容。只返回JSON。
用户问题：「${question}」
${intent.coreConflict ? '核心矛盾：' + intent.coreConflict : ''}

格式：
{"dimensions":[{"label":"2-4字","icon":"emoji","optimisticDesc":"一句话乐观","pessimisticDesc":"一句话悲观"}],"crossroadLabels":{"opt":"4字","pess":"4字"},"deepLabels":{"accept":"4字","reject":"4字"}}

要求：维度必须针对「${question}」的具体领域，不能套用模板。`;

  // === 第二次调用：命牌 ===
  const fatePrompt = `为决策「${question}」生成2张命牌文案。只返回JSON。
${intent.coreConflict ? '核心矛盾：' + intent.coreConflict : ''}

格式：
{"fateAccept":{"title":"2-4字标题","summary":["一句话1","一句话2","一句话3"],"stats":[{"label":"2-4字","value":7}],"epilogue":"第二人称承诺","bonus":"成就"},"fateReject":{"title":"2-4字标题","summary":["一句话1","一句话2","一句话3"],"stats":[{"label":"2-4字","value":7}],"epilogue":"第二人称承诺","bonus":"成就"}}

要求：命牌要基于「${question}」领域，title如"南下"/"留守"/"出手"/"按兵"。stats的label要匹配问题领域（如买房用"压力/升值/生活质量"，辞职用"成长/稳定/薪资"）。`;

  try {
    console.log('[treeService] 调用 LLM 生成维度...');
    const [dimText, fateText] = await Promise.all([
      callLLM(
        [
          { role: 'system', content: '你是决策推演内容生成器，只返回JSON。' },
          { role: 'user', content: dimPrompt },
        ],
        { maxTokens: 800, temperature: 0.75, timeout: 30000 }
      ),
      callLLM(
        [
          { role: 'system', content: '你是命牌文案生成器，只返回JSON。' },
          { role: 'user', content: fatePrompt },
        ],
        { maxTokens: 1000, temperature: 0.8, timeout: 30000 }
      ),
    ]);

    if (!dimText) {
      console.warn('[treeService] 维度生成返回空');
      return null;
    }

    // 解析维度
    let dimStr = dimText;
    const dimCodeBlock = dimText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (dimCodeBlock) dimStr = dimCodeBlock[1];
    else {
      const dimBrace = dimText.match(/\{[\s\S]*\}/);
      if (dimBrace) dimStr = dimBrace[0];
    }

    let dimParsed;
    try {
      dimParsed = JSON.parse(dimStr);
    } catch (e) {
      dimParsed = JSON.parse(dimStr.replace(/,(\s*[}\]])/g, '$1'));
    }

    if (!dimParsed.dimensions || !Array.isArray(dimParsed.dimensions) || dimParsed.dimensions.length === 0) {
      console.warn('[treeService] dimensions 缺失');
      return null;
    }

    // 解析命牌（命牌失败时用默认值兜底）
    let fateParsed = { fateAccept: null, fateReject: null };
    if (fateText) {
      let fateStr = fateText;
      const fateCodeBlock = fateText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fateCodeBlock) fateStr = fateCodeBlock[1];
      else {
        const fateBrace = fateText.match(/\{[\s\S]*\}/);
        if (fateBrace) fateStr = fateBrace[0];
      }
      try {
        fateParsed = JSON.parse(fateStr);
      } catch (e) {
        try {
          fateParsed = JSON.parse(fateStr.replace(/,(\s*[}\]])/g, '$1'));
        } catch (e2) {
          console.warn('[treeService] 命牌 JSON 解析失败，用默认值');
        }
      }
    } else {
      console.warn('[treeService] 命牌生成返回空，用默认值');
    }

    // 合并结果
    return {
      dimensions: dimParsed.dimensions,
      crossroadLabels: dimParsed.crossroadLabels || {},
      deepLabels: dimParsed.deepLabels || {},
      fateAccept: fateParsed.fateAccept || null,
      fateReject: fateParsed.fateReject || null,
    };
  } catch (e) {
    console.warn('[treeService] generateDynamicContent 失败:', e.message);
    return null;
  }
}

/**
 * 用 LLM 内容 + 结构骨架组装完整决策树
 *
 * @param {string} question 用户问题
 * @param {object} intent classifyIntent 返回的意图特征
 * @param {string} userMemory 用户记忆上下文
 * @returns {Promise<object|null>} 决策树对象 { nodes, topology, fateCards }
 */
export async function generateDecisionTree(question, intent = {}, userMemory = '') {
  if (!question || typeof question !== 'string') {
    return null;
  }

  const completeness =
    typeof intent.informationCompleteness === 'number'
      ? intent.informationCompleteness
      : 0.5;
  const dimCount = decideDimCount(completeness);

  // Step 1: LLM 生成动态内容
  const dynamic = await generateDynamicContent(question, dimCount, intent, userMemory);
  if (!dynamic) {
    console.warn('[treeService] 动态内容生成失败，降级返回 null');
    return null;
  }

  // Step 2: 服务器填充结构骨架
  const dimIds = Array.from({ length: dimCount }, (_, i) => `dim_${i + 1}`);
  const dimXPositions = getDimXPositions(dimCount);

  // 构建节点
  const nodes = {};

  // root 节点
  nodes.root = {
    id: 'root',
    type: 'input',
    label: '推演开始',
    depth: 0,
    probability: 100,
    content: {
      title: question,
      desc: ['八卦推演引擎已启动', `核心矛盾：${intent.coreConflict || question}`],
      placeholder: '思考你的选择...',
    },
    hasAgents: true,
    hasDice: false,
    branches: dynamic.dimensions.slice(0, dimCount).map((dim, i) => ({
      targetId: dimIds[i],
      label: dim.label || `维度${i + 1}`,
      icon: dim.icon || '◉',
    })),
    position: { x: 0.5, y: 0.05 },
  };

  // 维度节点
  dynamic.dimensions.slice(0, dimCount).forEach((dim, i) => {
    const dimId = dimIds[i];
    nodes[dimId] = {
      id: dimId,
      type: 'fog',
      label: dim.label || `维度${i + 1}`,
      depth: 1,
      probability: 100,
      content: {
        title: dim.label || `维度${i + 1}`,
        desc: [
          dim.optimisticDesc || '乐观场景下的考量',
          dim.pessimisticDesc || '悲观场景下的考量',
        ],
        placeholder: `思考${dim.label || '该维度'}对你的影响...`,
      },
      hasAgents: true,
      hasDice: true,
      branches: [
        {
          targetId: 'crossroad_opt',
          label: '乐观信号',
          condition: 'dice_high',
          diceRange: [4, 6],
        },
        {
          targetId: 'crossroad_pess',
          label: '悲观信号',
          condition: 'dice_low',
          diceRange: [1, 3],
        },
      ],
      position: { x: dimXPositions[i], y: 0.25 },
    };
  });

  // 交叉口节点
  const crossLabels = dynamic.crossroadLabels || {};
  nodes.crossroad_opt = {
    id: 'crossroad_opt',
    type: 'fog',
    label: crossLabels.opt || '乐观路口',
    depth: 2,
    probability: 100,
    content: {
      title: crossLabels.opt || '乐观路口',
      desc: ['各维度信号偏向乐观', '但乐观之下也有盲点需要审视'],
      placeholder: '在乐观情境下，你的选择会是什么？',
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'deep_accept', label: '深入接受', icon: '✓' },
      { targetId: 'deep_reject', label: '深入拒绝', icon: '✗' },
    ],
    position: { x: 0.35, y: 0.45 },
  };

  nodes.crossroad_pess = {
    id: 'crossroad_pess',
    type: 'fog',
    label: crossLabels.pess || '悲观路口',
    depth: 2,
    probability: 100,
    content: {
      title: crossLabels.pess || '悲观路口',
      desc: ['各维度信号偏向悲观', '但悲观之中也藏着转机'],
      placeholder: '在悲观情境下，你的选择会是什么？',
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'deep_accept', label: '逆势接受', icon: '✓' },
      { targetId: 'deep_reject', label: '稳妥拒绝', icon: '✗' },
    ],
    position: { x: 0.65, y: 0.45 },
  };

  // 深层思考节点
  const deepLabels = dynamic.deepLabels || {};
  nodes.deep_accept = {
    id: 'deep_accept',
    type: 'fog',
    label: deepLabels.accept || '接受之路',
    depth: 3,
    probability: 100,
    content: {
      title: deepLabels.accept || '接受之路',
      desc: ['深入思考接受的后果', '这是你真正想要的吗？'],
      placeholder: '如果你选择接受，最坏的情况是什么？',
    },
    hasAgents: true,
    hasDice: false,
    branches: [{ targetId: 'fate_accept', label: '揭示命牌', icon: '★' }],
    position: { x: 0.35, y: 0.62 },
  };

  nodes.deep_reject = {
    id: 'deep_reject',
    type: 'fog',
    label: deepLabels.reject || '拒绝之路',
    depth: 3,
    probability: 100,
    content: {
      title: deepLabels.reject || '拒绝之路',
      desc: ['深入思考拒绝的后果', '放弃是否就是最好的选择？'],
      placeholder: '如果你选择拒绝，最好的情况是什么？',
    },
    hasAgents: true,
    hasDice: false,
    branches: [{ targetId: 'fate_reject', label: '揭示命牌', icon: '★' }],
    position: { x: 0.65, y: 0.62 },
  };

  // 命牌节点
  nodes.fate_accept = {
    id: 'fate_accept',
    type: 'fate',
    label: '命运卡',
    depth: 4,
    probability: 100,
    content: { title: '命运揭示', desc: [], placeholder: '' },
    hasAgents: false,
    hasDice: false,
    branches: [],
    position: { x: 0.35, y: 0.8 },
    fateCardId: 'fate_accept',
  };

  nodes.fate_reject = {
    id: 'fate_reject',
    type: 'fate',
    label: '命运卡',
    depth: 4,
    probability: 100,
    content: { title: '命运揭示', desc: [], placeholder: '' },
    hasAgents: false,
    hasDice: false,
    branches: [],
    position: { x: 0.65, y: 0.8 },
    fateCardId: 'fate_reject',
  };

  // 构建拓扑
  const topology = {
    root: { children: dimIds, parent: null },
  };
  dimIds.forEach((id) => {
    topology[id] = { children: ['crossroad_opt', 'crossroad_pess'], parent: 'root' };
  });
  topology.crossroad_opt = { children: ['deep_accept', 'deep_reject'], parent: 'dynamic' };
  topology.crossroad_pess = { children: ['deep_accept', 'deep_reject'], parent: 'dynamic' };
  topology.deep_accept = { children: ['fate_accept'], parent: 'dynamic' };
  topology.deep_reject = { children: ['fate_reject'], parent: 'dynamic' };
  topology.fate_accept = { children: [], parent: 'deep_accept' };
  topology.fate_reject = { children: [], parent: 'deep_reject' };

  // 构建命牌（data 为 null 时用默认值兜底）
  const defaultFate = (type) => ({
    title: type === 'positive' ? '接受之路' : '拒绝之路',
    summary:
      type === 'positive'
        ? ['你选择了接受，踏入未知', '过程充满挑战与成长', '回头看，这是勇敢的一跃']
        : ['你选择了拒绝，稳守现状', '错过的可能性成为隐痛', '但稳定也给了你别样的从容'],
    stats:
      type === 'positive'
        ? [
            { label: '成长', value: 8, max: 10 },
            { label: '稳定', value: 4, max: 10 },
            { label: '幸福', value: 7, max: 10 },
          ]
        : [
            { label: '成长', value: 5, max: 10 },
            { label: '稳定', value: 9, max: 10 },
            { label: '幸福', value: 7, max: 10 },
          ],
    epilogue:
      type === 'positive'
        ? '一年后回望此刻，你会发现这个决定改变了轨迹。'
        : '有时候最好的决定，不是最有野心的那个，而是最适合自己的。',
    bonus: '隐藏成就解锁',
  });

  const buildFateCard = (id, data, type) => {
    const d = data || defaultFate(type);
    return {
      id,
      title: d.title || (type === 'positive' ? '接受之路' : '拒绝之路'),
      type,
      border:
        type === 'positive'
          ? 'linear-gradient(135deg, #E8A830, #00A86B)'
          : 'linear-gradient(135deg, #7B8794, #A0AAB4)',
      summary: Array.isArray(d.summary) ? d.summary : ['命运已定', '前路渐明', '选择即承担'],
      stats: Array.isArray(d.stats)
        ? d.stats.map((s) => ({ label: s.label || '维度', value: s.value || 5, max: 10, desc: s.desc || '' }))
        : [{ label: '信心', value: 7, max: 10, desc: '' }],
      epilogue: d.epilogue || '一年后回望此刻，你会发现这个决定改变了轨迹。',
      bonus: d.bonus || '隐藏成就解锁',
    };
  };

  const fateCards = {
    fate_accept: buildFateCard('fate_accept', dynamic.fateAccept, 'positive'),
    fate_reject: buildFateCard('fate_reject', dynamic.fateReject, 'neutral'),
  };

  console.log(`[treeService] 决策树生成成功: ${dimCount} 维度, ${Object.keys(nodes).length} 节点`);

  return { nodes, topology, fateCards };
}

export default {
  generateDecisionTree,
};
