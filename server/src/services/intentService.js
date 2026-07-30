/**
 * 通用意图识别服务（特征提取，非分类）
 * - classifyIntent: 单次 LLM 调用提取 5 维意图特征 + 澄清问题
 * - assessCompleteness: 评估信息完整度，决定是否需要先澄清
 *
 * LLM 失败时降级返回默认意图
 */

import { callLLM } from './llmRouter.js';
import { retrieveMemories, getUserProfile } from './memoryService.js';

/**
 * 降级默认意图
 */
function fallbackIntent() {
  return {
    decisionStructure: 'open_exploration',
    urgency: 'none',
    informationCompleteness: 0.5,
    emotionalLoad: 'low',
    domainHints: [],
    missingInfo: [],
    clarifyingQuestions: [],
    coreConflict: '',
    fallback: true,
  };
}

/**
 * 分析用户问题，提取 5 维意图特征
 * 单次 LLM 调用，失败时降级返回默认意图
 *
 * @param {string} question 用户问题
 * @param {string|null} userId 用户ID，用于注入历史记忆与画像
 * @returns {Promise<object>} 意图特征对象
 */
export async function classifyIntent(question, userId = null) {
  if (!question || typeof question !== 'string') {
    return fallbackIntent();
  }

  // 注入用户画像与历史推演记忆
  let memoryContext = '';
  if (userId) {
    try {
      const profile = await getUserProfile(userId);
      const memories = await retrieveMemories(userId, question, 3);
      if (profile) {
        memoryContext += `\n【关于此用户的背景】\n${profile}\n`;
      }
      if (memories && memories.length > 0) {
        memoryContext += `\n【相关历史推演】\n${memories.map((m) => `- ${m.content}`).join('\n')}\n`;
      }
    } catch (e) {
      console.warn('[intent] 记忆加载失败:', e.message);
    }
  }

  const systemPrompt = `你是意图识别引擎，负责从用户输入中提取 5 维意图特征。这不是分类，而是连续特征提取——任意输入都能得到特征向量。
${memoryContext}
【任务】分析用户问题，提取以下 5 维特征 + 辅助信息。

【输出格式】JSON:
{
  "decisionStructure": "binary_choice | multi_option | yes_no | open_exploration | emotional_venting | factual_query",
  "urgency": "high | medium | low | none",
  "informationCompleteness": 0.0-1.0,
  "emotionalLoad": "low | medium | high",
  "domainHints": ["领域标签，LLM自由生成"],
  "missingInfo": ["缺失的关键信息"],
  "clarifyingQuestions": ["若信息不足，生成1-3个澄清问题"],
  "coreConflict": "一句话点出问题的核心矛盾"
}

【维度说明】
- decisionStructure: binary_choice(二选一) / multi_option(多选项) / yes_no(是否题) / open_exploration(开放探索) / emotional_venting(情绪宣泄) / factual_query(事实查询)
- urgency: high(限时决策) / medium(有deadline) / low(无deadline但有时效) / none(纯探索)
- informationCompleteness: 0.0-1.0，信息越完整越接近1.0
- emotionalLoad: low/medium/high，情绪强度
- domainHints: 不限于预设列表，LLM 根据问题自由生成领域标签（如"职业"、"投资"、"感情"、"创业"、"健康"等）

【规则】
1. 只返回 JSON，不要其他文字
2. clarifyingQuestions 仅在 informationCompleteness < 0.6 时生成，否则留空数组
3. coreConflict 要精准，一句话点出核心矛盾，不要泛泛而谈
4. domainHints 要具体，体现问题领域
5. 结合用户背景与历史记忆理解问题意图`;

  const userPrompt = `用户问题：「${question}」

请提取这个问题的 5 维意图特征。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 400, temperature: 0.3, timeout: 8000 }
    );

    if (!text) {
      return fallbackIntent();
    }

    // 提取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return fallbackIntent();
    }

    const parsed = JSON.parse(match[0]);

    return {
      decisionStructure: parsed.decisionStructure || 'open_exploration',
      urgency: parsed.urgency || 'none',
      informationCompleteness:
        typeof parsed.informationCompleteness === 'number'
          ? parsed.informationCompleteness
          : 0.5,
      emotionalLoad: parsed.emotionalLoad || 'low',
      domainHints: Array.isArray(parsed.domainHints) ? parsed.domainHints : [],
      missingInfo: Array.isArray(parsed.missingInfo) ? parsed.missingInfo : [],
      clarifyingQuestions: Array.isArray(parsed.clarifyingQuestions)
        ? parsed.clarifyingQuestions
        : [],
      coreConflict: parsed.coreConflict || '',
      fallback: false,
    };
  } catch (e) {
    console.warn('[intentService] classifyIntent LLM 失败，降级返回默认意图:', e.message);
    return fallbackIntent();
  }
}

/**
 * 评估信息完整度，决定是否需要先澄清
 *
 * @param {object} intent classifyIntent 的返回结果
 * @returns {{ needClarify: boolean, questions: string[] }}
 */
export function assessCompleteness(intent) {
  if (!intent) {
    return { needClarify: false, questions: [] };
  }

  const questions = Array.isArray(intent.clarifyingQuestions)
    ? intent.clarifyingQuestions
    : [];

  const needClarify =
    typeof intent.informationCompleteness === 'number' &&
    intent.informationCompleteness < 0.6 &&
    questions.length > 0;

  return {
    needClarify,
    questions: needClarify ? questions : [],
  };
}

export default {
  classifyIntent,
  assessCompleteness,
};
