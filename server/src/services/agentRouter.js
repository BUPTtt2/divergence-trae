/**
 * Agent路由器 (AgentRouter)
 * 演的核心编排: 分析 → 匹配 → 生成 → 合成
 *
 * 这是演作为Agent生成引擎的核心模块:
 * 1. 分析: LLM深度分析用户问题 → 拆解决策维度
 * 2. 匹配: 从种子Agent + 共享池中匹配已有Agent
 * 3. 生成: 为缺失维度动态生成新Agent
 * 4. 合成: 合并所有Agent → 去重排序 → 返回
 */

import { callLLM } from './llmRouter.js';
import sharedPool from './sharedPool.js';
import { generateAgentsForDimensions } from './dynamicGenerator.js';
import { validateGeneratedAgent } from './qualityValidator.js';
import { AGENT_POOL } from '../data/agentPool.js';
import { PERSPECTIVES, PERSPECTIVE_LABELS, AGENT_SOURCES, computeStanceSimilarity, formatAgentForOutput } from '../data/agentSchema.js';
import { getSeedAgentsWithPerspectives } from '../data/seedAgents.js';
import logger from './logger.js';

const ANALYSIS_TIMEOUT = 8000;
const MIN_COVERAGE_THRESHOLD = 1.0; // 目标覆盖率 (100%)
const MAX_AGENTS = 6;
const MIN_AGENTS = 1;

/**
 * 演·分析问题并返回推荐Agent列表
 * 这是系统的主要入口
 *
 * @param {string} question 用户问题
 * @param {string} userId 用户ID (可选)
 * @param {object} options { forceRegenerate?, useSharedPool? }
 * @returns {Promise<object>} 分析结果
 */
export async function analyzeAndRoute(question, userId = null, options = {}) {
  const t0 = Date.now();
  logger.info('[AgentRouter] 开始分析', { question, userId, options });

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    logger.warn('[AgentRouter] 问题为空，返回降级响应');
    return getFallbackResponse();
  }

  const { forceRegenerate = false, useSharedPool = true } = options;
  logger.info('[AgentRouter] 配置', { forceRegenerate, useSharedPool });

  try {
    // Step 1: 演·深度分析
    logger.info('[AgentRouter] Step 1: 演·深度分析开始');
    const t1 = Date.now();
    const analysis = await analyzeQuestionDimensions(question);
    logger.info('[AgentRouter] Step 1 完成', {
      duration: `${Date.now() - t1}ms`,
      dimensionCount: analysis.dimensions?.length || 0,
      dimensions: analysis.dimensions?.map(d => `${d.name}(${d.perspective},imp=${d.importance})`),
      reasoning: analysis.reasoning?.slice(0, 80),
      fallback: analysis.reasoning === '基于关键词的快速分类',
    });

    // Step 2: 匹配种子Agent
    logger.info('[AgentRouter] Step 2: 匹配种子Agent开始');
    const seedMatch = matchSeedAgents(analysis.dimensions);
    logger.info('[AgentRouter] Step 2 完成', {
      seedCount: seedMatch.length,
      seedAgents: seedMatch.map(a => `${a.id}(${a.name})`),
      matchedDimensions: seedMatch.map(a => a.matchedDimension),
    });

    // Step 3: 匹配共享池
    let sharedMatches = [];
    if (useSharedPool && !forceRegenerate) {
      logger.info('[AgentRouter] Step 3: 匹配共享池开始');
      const t3 = Date.now();
      try {
        sharedMatches = await sharedPool.matchByDimensions(analysis.dimensions);
        logger.info('[AgentRouter] Step 3 完成', {
          duration: `${Date.now() - t3}ms`,
          sharedCount: sharedMatches.length,
          sharedAgents: sharedMatches.map(a => `${a.id}(${a.name})`),
        });
      } catch (e) {
        logger.warn('[AgentRouter] Step 3 共享池匹配失败', {
          error: e.message,
          stack: e.stack?.slice(0, 200),
          duration: `${Date.now() - t3}ms`,
        });
      }
    } else {
      logger.info('[AgentRouter] Step 3 跳过', { reason: forceRegenerate ? 'forceRegenerate=true' : 'useSharedPool=false' });
    }

    // Step 4: 计算覆盖率
    const coverage = calculateCoverage(analysis.dimensions, [...seedMatch, ...sharedMatches]);
    logger.info('[AgentRouter] Step 4: 覆盖率计算', {
      covered: coverage.covered,
      total: coverage.total,
      ratio: `${(coverage.ratio * 100).toFixed(0)}%`,
      coveredPerspectives: coverage.coveredPerspectives,
      gaps: coverage.gaps?.map(g => `${g.name}(${g.perspective})`),
    });

    // Step 5: 动态生成 (如果有缺失维度)
    let generatedAgents = [];
    if (coverage.ratio < MIN_COVERAGE_THRESHOLD || forceRegenerate) {
      const missingDims = analysis.dimensions.filter(
        d => !coverage.coveredPerspectives.includes(d.perspective)
      );

      logger.info('[AgentRouter] Step 5: 动态生成判定', {
        needGenerate: missingDims.length > 0,
        missingCount: missingDims.length,
        missingDims: missingDims.map(d => `${d.name}(${d.perspective})`),
        forceRegenerate,
      });

      if (missingDims.length > 0) {
        logger.info('[AgentRouter] Step 5: 调用DynamicGenerator开始');
        const t5 = Date.now();
        const existingForGen = [...AGENT_POOL, ...seedMatch, ...sharedMatches];
        try {
          generatedAgents = await generateAgentsForDimensions(
            missingDims,
            question,
            existingForGen
          );
          logger.info('[AgentRouter] Step 5 完成', {
            duration: `${Date.now() - t5}ms`,
            generatedCount: generatedAgents.length,
            generatedAgents: generatedAgents.map(a => ({
              id: a.id,
              name: a.name,
              stance: a.stance,
              perspectives: a.perspectives,
              source: a.source,
            })),
          });
        } catch (e) {
          logger.error('[AgentRouter] Step 5 动态生成失败', {
            error: e.message,
            stack: e.stack?.slice(0, 300),
            duration: `${Date.now() - t5}ms`,
            missingDims: missingDims.map(d => d.perspective),
          });
        }
      }
    } else {
      logger.info('[AgentRouter] Step 5 跳过', {
        reason: '覆盖率已达100%',
        ratio: `${(coverage.ratio * 100).toFixed(0)}%`,
      });
    }

    // Step 6: 合成
    const allAgents = synthesizeAgents(
      seedMatch,
      sharedMatches,
      generatedAgents,
      analysis.dimensions
    );
    logger.info('[AgentRouter] Step 6: 合成完成', {
      inputCounts: { seed: seedMatch.length, shared: sharedMatches.length, generated: generatedAgents.length },
      afterDedup: allAgents.length,
      finalAgents: allAgents.map(a => `${a.id}(${a.name},src=${a.source || 'seed'})`),
    });

    // Step 7: 最终覆盖率
    const finalCoverage = calculateCoverage(analysis.dimensions, allAgents);
    logger.info('[AgentRouter] Step 7: 最终覆盖率', {
      finalCovered: finalCoverage.covered,
      finalTotal: finalCoverage.total,
      finalRatio: `${(finalCoverage.ratio * 100).toFixed(0)}%`,
      remainingGaps: finalCoverage.gaps?.map(g => g.perspective),
    });

    const result = {
      analysis: analysis.analysis,
      dimensions: analysis.dimensions,
      reasoning: analysis.reasoning,
      coverage: finalCoverage,
      seedAgents: seedMatch.map(formatAgentForOutput),
      sharedAgents: sharedMatches.map(formatAgentForOutput),
      generatedAgents: generatedAgents.map(formatAgentForOutput),
      recommendedIds: allAgents.map(a => a.id),
      totalCoverage: finalCoverage.ratio,
      cacheHit: sharedMatches.length > 0 && generatedAgents.length === 0,
      totalAgents: allAgents.length,
    };

    logger.info('[AgentRouter] 分析完成', {
      totalDuration: `${Date.now() - t0}ms`,
      totalAgents: result.totalAgents,
      totalCoverage: `${(result.totalCoverage * 100).toFixed(0)}%`,
      cacheHit: result.cacheHit,
      breakdown: `种子=${seedMatch.length} 共享=${sharedMatches.length} 生成=${generatedAgents.length}`,
    });

    return result;
  } catch (e) {
    logger.error('[AgentRouter] analyzeAndRoute 失败，使用降级', {
      error: e.message,
      stack: e.stack?.slice(0, 400),
      question,
      totalDuration: `${Date.now() - t0}ms`,
    });
    return getFallbackResponse(question);
  }
}

// ============ Step 1: 分析 ============

/**
 * 演·深度分析: 拆解决策维度
 */
async function analyzeQuestionDimensions(question) {
  logger.info('[AgentRouter][analyze] 开始LLM维度分析', { question, seedCount: AGENT_POOL.length });
  const seedList = getSeedAgentsWithPerspectives();
  const availableText = seedList
    .map(a => `- ${a.id}(${a.name}): ${a.stance} [perspectives: ${(a.perspectives || []).join(', ')}]`)
    .join('\n');

  const prompt = `你是"演"，推演核心，统揽全局的太极Agent。

你的任务：深度分析用户的决策问题，拆解开这个问题的核心矛盾和关键决策维度。

【用户问题】「${question}」

【可用种子智囊池】
${availableText}

【输出要求 - JSON格式】
{
  "analysis": "2-3句话深度分析，拆解核心矛盾和关键维度",
  "dimensions": [
    {
      "name": "维度中文名 (如风险评估)",
      "perspective": "视角英文标签",
      "importance": 1-5,
      "description": "此维度在决策中的意义",
      "coveredBy": ["能覆盖此维度的种子Agent ID"]
    }
  ],
  "reasoning": "分析过程的简要说明"
}

【可选perspective标签】
financial, risk, emotional, reflection, strategic, action, communication, macro, health, legal, education, experience, destination_info, ethical, practical

【规则】
1. dimensions: 3-6个，必须覆盖问题的核心矛盾
2. 每个dimension必须有明确的决策意义
3. coveredBy: 引用能覆盖此维度的种子Agent (可能为空，表示缺失)
4. 如果所有种子Agent都不能覆盖某个维度，coveredBy留空
5. 只返回JSON`;

  try {
    logger.info('[AgentRouter][analyze] 调用LLM', { maxTokens: 800, timeout: ANALYSIS_TIMEOUT });
    const tLLM = Date.now();
    const text = await callLLM(
      [{ role: 'user', content: prompt }],
      { maxTokens: 800, temperature: 0.3, timeout: ANALYSIS_TIMEOUT }
    );
    logger.info('[AgentRouter][analyze] LLM返回', {
      duration: `${Date.now() - tLLM}ms`,
      hasText: !!text,
      textLength: text?.length || 0,
      textPreview: text?.slice(0, 120),
    });

    if (!text) {
      logger.warn('[AgentRouter][analyze] LLM返回空，使用降级分析');
      return getFallbackAnalysis(question);
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn('[AgentRouter][analyze] LLM返回中未找到JSON，使用降级分析', {
        textPreview: text.slice(0, 200),
      });
      return getFallbackAnalysis(question);
    }

    const parsed = JSON.parse(match[0]);
    logger.info('[AgentRouter][analyze] JSON解析成功', {
      rawDimensionCount: parsed.dimensions?.length || 0,
      hasAnalysis: !!parsed.analysis,
      hasReasoning: !!parsed.reasoning,
    });

    // 验证和清理
    const dimensions = (parsed.dimensions || []).map(d => ({
      name: d.name || '未知维度',
      perspective: (d.perspective || 'reflection').toLowerCase(),
      importance: Math.min(5, Math.max(1, d.importance || 3)),
      description: d.description || '',
      coveredBy: d.coveredBy || [],
    }));

    logger.info('[AgentRouter][analyze] 维度清理完成', {
      cleanedDimensions: dimensions.map(d => ({
        name: d.name,
        perspective: d.perspective,
        importance: d.importance,
        coveredByCount: d.coveredBy?.length || 0,
      })),
    });

    return {
      analysis: parsed.analysis || '',
      dimensions,
      reasoning: parsed.reasoning || '',
    };
  } catch (e) {
    logger.error('[AgentRouter][analyze] LLM分析失败，使用降级', {
      error: e.message,
      stack: e.stack?.slice(0, 200),
    });
    return getFallbackAnalysis(question);
  }
}

// ============ Step 2: 种子匹配 ============

function matchSeedAgents(dimensions) {
  if (!dimensions || dimensions.length === 0) {
    logger.warn('[AgentRouter][matchSeed] 维度为空，返回空列表');
    return [];
  }

  const seedAgents = AGENT_POOL;
  const matched = [];
  const usedIds = new Set();

  // 按重要性排序维度
  const sortedDims = [...dimensions].sort((a, b) => (b.importance || 3) - (a.importance || 3));

  logger.info('[AgentRouter][matchSeed] 开始匹配', {
    dimensionCount: sortedDims.length,
    sortedDims: sortedDims.map(d => `${d.name}(${d.perspective},imp=${d.importance})`),
  });

  for (const dim of sortedDims) {
    let dimCovered = false;

    // 检查coveredBy中引用的Agent
    if (dim.coveredBy && Array.isArray(dim.coveredBy)) {
      for (const agentId of dim.coveredBy) {
        if (usedIds.has(agentId)) continue;
        const agent = seedAgents.find(a => a.id === agentId);
        if (agent) {
          matched.push({ ...agent, matchedDimension: dim.name });
          usedIds.add(agentId);
          dimCovered = true;
          logger.info('[AgentRouter][matchSeed] coveredBy命中', {
            dimension: dim.name,
            agentId,
            agentName: agent.name,
          });
        }
      }
    }

    // 检查Agent的perspectives/questionTypes是否匹配
    if (!dimCovered) {
      for (const agent of seedAgents) {
        if (usedIds.has(agent.id)) continue;
        // 种子Agent的perspectives从seedAgents映射获取
        const seedWithPersp = seedAgents.find(s => s.id === agent.id);
        const perspectives = seedWithPersp?.perspectives || agent.perspectives || [];
        const questionTypes = agent.questionTypes || [];

        if (perspectives.includes(dim.perspective) ||
            questionTypes.includes(dim.perspective)) {
          matched.push({ ...agent, matchedDimension: dim.name, perspectives });
          usedIds.add(agent.id);
          dimCovered = true;
          logger.info('[AgentRouter][matchSeed] perspectives/questionTypes命中', {
            dimension: dim.name,
            perspective: dim.perspective,
            agentId: agent.id,
            agentName: agent.name,
            matchedBy: perspectives.includes(dim.perspective) ? 'perspectives' : 'questionTypes',
          });
          break;
        }
      }
    }

    if (!dimCovered) {
      logger.info('[AgentRouter][matchSeed] 维度未找到匹配种子Agent', {
        dimension: dim.name,
        perspective: dim.perspective,
      });
    }
  }

  // 确保镜渊(reflection)始终在内 (自我反思维度)
  if (!usedIds.has('jingyuan')) {
    const jingyuan = seedAgents.find(a => a.id === 'jingyuan');
    if (jingyuan) {
      matched.push({ ...jingyuan, matchedDimension: '自我反思' });
      logger.info('[AgentRouter][matchSeed] 镜渊(jingyuan)未匹配，已强制添加');
    }
  }

  const result = matched.slice(0, MAX_AGENTS);
  logger.info('[AgentRouter][matchSeed] 匹配完成', {
    totalMatched: matched.length,
    afterLimit: result.length,
    agentIds: result.map(a => a.id),
  });
  return result;
}

// ============ Step 4: 覆盖率计算 ============

function calculateCoverage(dimensions, agents) {
  if (!dimensions || dimensions.length === 0) {
    return { covered: 0, total: 0, ratio: 0, gaps: [], coveredPerspectives: [] };
  }

  const coveredPerspectives = new Set();
  const gaps = [];

  for (const dim of dimensions) {
    const hasCoverage = agents.some(agent => {
      const perspectives = agent.perspectives || [];
      const questionTypes = agent.questionTypes || [];
      const tags = agent.tags || [];
      return perspectives.includes(dim.perspective) ||
             questionTypes.includes(dim.perspective) ||
             tags.includes(dim.perspective) ||
             (agent.matchedDimension && agent.matchedDimension === dim.name);
    });

    if (hasCoverage) {
      coveredPerspectives.add(dim.perspective);
    } else {
      gaps.push(dim);
    }
  }

  const covered = coveredPerspectives.size;
  const total = dimensions.length;

  return {
    covered,
    total,
    ratio: total > 0 ? covered / total : 0,
    gaps,
    coveredPerspectives: [...coveredPerspectives],
  };
}

// ============ Step 6: 合成 ============

function synthesizeAgents(seedAgents, sharedAgents, generatedAgents, dimensions) {
  const all = [...seedAgents, ...sharedAgents, ...generatedAgents];
  logger.info('[AgentRouter][synthesize] 开始合成', {
    inputTotal: all.length,
    breakdown: `seed=${seedAgents.length}, shared=${sharedAgents.length}, generated=${generatedAgents.length}`,
  });

  // 去重 (先按ID，再按名称)
  const byId = new Map();
  const byName = new Map();
  let dedupCount = 0;

  for (const agent of all) {
    const idKey = agent.id;
    const nameKey = (agent.name || '').toLowerCase();

    if (byId.has(idKey)) {
      dedupCount++;
      logger.info('[AgentRouter][synthesize] ID去重', { id: idKey, name: agent.name });
      continue;
    }
    if (byName.has(nameKey) && nameKey) {
      dedupCount++;
      logger.info('[AgentRouter][synthesize] 名称去重', { name: agent.name, existingId: byName.get(nameKey).id });
      continue;
    }

    byId.set(idKey, agent);
    byName.set(nameKey, agent);
  }

  const unique = [...byId.values()];
  logger.info('[AgentRouter][synthesize] 去重完成', {
    beforeDedup: all.length,
    afterDedup: unique.length,
    removed: dedupCount,
  });

  // 按维度匹配度排序
  const dimensionPerspectives = new Set(dimensions.map(d => d.perspective));
  unique.sort((a, b) => {
    const aMatch = (a.perspectives || []).filter(p => dimensionPerspectives.has(p)).length;
    const bMatch = (b.perspectives || []).filter(p => dimensionPerspectives.has(p)).length;
    return bMatch - aMatch;
  });

  const result = unique.slice(0, MAX_AGENTS);
  logger.info('[AgentRouter][synthesize] 排序+截断完成', {
    sorted: unique.length,
    afterLimit: result.length,
    finalOrder: result.map(a => `${a.id}(${a.name})`),
  });
  return result;
}

// ============ 降级方案 ============

function getFallbackResponse(question = '') {
  logger.info('[AgentRouter][fallback] 返回降级响应', { question: question?.slice(0, 60) });
  const fallbackAgentIds = ['jingyuan', 'fengyan', 'qiangu'];
  const fallbackAgents = fallbackAgentIds.map(id => {
    const agent = AGENT_POOL.find(a => a.id === id);
    return agent ? formatAgentForOutput(agent) : null;
  }).filter(Boolean);

  return {
    analysis: '问题需要从多视角审视',
    dimensions: [
      { name: '反思', perspective: 'reflection', importance: 5, description: '自我审视', coveredBy: ['jingyuan'] },
      { name: '风险', perspective: 'risk', importance: 4, description: '风险评估', coveredBy: ['fengyan'] },
      { name: '财务', perspective: 'financial', importance: 3, description: '成本分析', coveredBy: ['qiangu'] },
    ],
    reasoning: '使用默认智囊组合',
    coverage: { covered: 3, total: 3, ratio: 1.0, gaps: [], coveredPerspectives: ['reflection', 'risk', 'financial'] },
    seedAgents: fallbackAgents,
    sharedAgents: [],
    generatedAgents: [],
    recommendedIds: fallbackAgentIds,
    totalCoverage: 1.0,
    cacheHit: false,
    totalAgents: fallbackAgents.length,
    fallback: true,
  };
}

function getFallbackAnalysis(question) {
  logger.info('[AgentRouter][fallback] 使用关键词降级分析', { question: question?.slice(0, 60) });
  // 根据问题关键词做简单分类
  const lowerQ = (question || '').toLowerCase();

  const dims = [];
  const addDim = (name, perspective, importance, coveredBy) => {
    dims.push({ name, perspective, importance, description: `${name}相关考虑`, coveredBy });
  };

  // 简单关键词匹配
  if (/旅行|旅游|去|出发|西藏|云南|旅行/.test(question)) {
    addDim('风险评估', 'risk', 5, ['fengyan']);
    addDim('体验价值', 'experience', 4, []);
    addDim('身体适应', 'health', 4, ['jiankang']);
    addDim('财务成本', 'financial', 3, ['qiangu']);
  } else if (/工作|职业|offer|跳槽|涨薪/.test(lowerQ)) {
    addDim('财务回报', 'financial', 5, ['qiangu']);
    addDim('职业发展', 'strategic', 5, ['luxiang']);
    addDim('风险评估', 'risk', 4, ['fengyan']);
  } else if (/健康|身体|生病|运动/.test(lowerQ)) {
    addDim('身体风险', 'risk', 5, ['fengyan']);
    addDim('健康管理', 'health', 5, ['jiankang']);
    addDim('生活质量', 'emotional', 4, ['xinhe']);
  } else if (/感情|恋爱|结婚|分手/.test(lowerQ)) {
    addDim('情感需求', 'emotional', 5, ['xinhe']);
    addDim('沟通方式', 'communication', 4, ['duiyan']);
    addDim('自我反思', 'reflection', 4, ['jingyuan']);
  } else {
    addDim('自我反思', 'reflection', 5, ['jingyuan']);
    addDim('风险评估', 'risk', 4, ['fengyan']);
    addDim('行动可行性', 'practical', 3, ['zhenxing']);
  }

  return {
    analysis: `用户的问题涉及${dims.map(d => d.name).join('、')}等关键维度`,
    dimensions: dims,
    reasoning: '基于关键词的快速分类',
  };
}

export default {
  analyzeAndRoute,
};
