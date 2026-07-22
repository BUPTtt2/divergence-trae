/**
 * 周易起卦引擎
 * - castHexagram: 金钱卦算法，三枚铜钱掷六次
 * - getHexagram: 根据六爻获取卦象
 * - interpretHexagram: 调用 LLM 解读卦象
 */

import hexagramsData from '../data/hexagrams.json' with { type: 'json' };
import { callLLM } from './llmRouter.js';

// 构建卦象查找表：key = 六爻二进制（初爻为最低位，阳=1 阴=0）
const hexagramMap = new Map();
for (const hex of hexagramsData) {
  // lines 数组顺序：初(底) → 二 → 三 → 四 → 五 → 上(顶)
  let key = 0;
  for (let i = 0; i < 6; i++) {
    const line = hex.lines[i];
    if (line && line.isYang) {
      key |= (1 << i); // 初爻为 bit0
    }
  }
  hexagramMap.set(key, hex);
}

/**
 * 掷一枚铜钱
 * 正面（概率 0.5）记 3 分，反面记 2 分
 * @returns {number} 3 或 2
 */
function tossCoin() {
  return Math.random() < 0.5 ? 3 : 2;
}

/**
 * 掷三枚铜钱，得到一爻
 * 三枚合计：6=老阴(变阳)、7=少阳、8=少阴、9=老阳(变阴)
 * @returns {{ value: number, isYang: boolean, isChanging: boolean }}
 */
function tossThreeCoins() {
  const sum = tossCoin() + tossCoin() + tossCoin();
  switch (sum) {
    case 6: // 老阴：阴，变阳
      return { value: 6, isYang: false, isChanging: true };
    case 7: // 少阳：阳，不变
      return { value: 7, isYang: true, isChanging: false };
    case 8: // 少阴：阴，不变
      return { value: 8, isYang: false, isChanging: false };
    case 9: // 老阳：阳，变阴
      return { value: 9, isYang: true, isChanging: true };
    default:
      return { value: 8, isYang: false, isChanging: false };
  }
}

/**
 * 根据六爻获取卦象
 * @param {Array<boolean>} linePattern 六爻数组（从下到上，true=阳 false=阴）
 * @returns {object|null} 卦象对象
 */
export function getHexagram(linePattern) {
  if (!Array.isArray(linePattern) || linePattern.length !== 6) {
    return null;
  }
  let key = 0;
  for (let i = 0; i < 6; i++) {
    if (linePattern[i]) {
      key |= (1 << i);
    }
  }
  return hexagramMap.get(key) || null;
}

/**
 * 金钱卦起卦：三枚铜钱掷六次
 * 从下往上排六爻，得到本卦和变卦
 *
 * @returns {{
 *   original: object,
 *   changed: object|null,
 *   changingLines: number[],
 *   lineText: string,
 *   tosses: Array
 * }}
 */
export function castHexagram() {
  // 掷六次，从下到上
  const tosses = [];
  for (let i = 0; i < 6; i++) {
    tosses.push(tossThreeCoins());
  }

  // 本卦爻象
  const originalLines = tosses.map((t) => t.isYang);

  // 变卦爻象
  const changingLines = []; // 变爻位置（0=初，5=上）
  const changedLines = tosses.map((t, i) => {
    if (t.isChanging) {
      changingLines.push(i);
      return !t.isYang; // 变爻翻转
    }
    return t.isYang;
  });

  // 查找本卦
  const original = getHexagram(originalLines);

  // 查找变卦（有变爻时）
  let changed = null;
  if (changingLines.length > 0) {
    changed = getHexagram(changedLines);
  }

  // 获取对应爻辞
  let lineText = '';
  if (original && original.lines) {
    if (changingLines.length === 1) {
      // 单个变爻：取该爻爻辞
      const idx = changingLines[0];
      lineText = original.lines[idx]?.text || '';
    } else if (changingLines.length > 1 && changingLines.length < 6) {
      // 多个变爻：取本卦卦辞
      lineText = original.judgement || '';
    } else if (changingLines.length === 0) {
      // 无变爻：取本卦卦辞
      lineText = original.judgement || '';
    } else {
      // 六爻全变：取变卦卦辞
      lineText = changed?.judgement || original.judgement || '';
    }
  }

  return {
    original,
    changed,
    changingLines,
    lineText,
    tosses: tosses.map((t) => ({
      value: t.value,
      isYang: t.isYang,
      isChanging: t.isChanging,
    })),
  };
}

/**
 * 解读卦象
 * 调用 LLM 生成卦象解读，返回反问、框架、签文、总结
 *
 * @param {object} hexagram 卦象对象（castHexagram 的结果）
 * @param {string} question 用户问题
 * @param {Array} agentDialogues Agent 对话 [{ agentId, name, text }]
 * @returns {Promise<{verse, framework, powerfulQuestion, summary}>}
 */
export async function interpretHexagram(hexagram, question, agentDialogues = []) {
  const { original, changed, lineText, changingLines } = hexagram;

  // 本地兜底内容
  const localResult = generateLocalInterpretation(hexagram, question);

  const systemPrompt = `你是「演」，这场推演的主持人。基于卦象与智囊发言，为用户生成解读。

【输出格式 - 严格用 JSON】
{
  "verse": "一句可带走的签文，不超过20字，意境感，像传统签文",
  "framework": "一个决策框架，不超过25字，可操作、可记忆",
  "powerfulQuestion": "一句反问，不超过30字，击中用户没说出口的盲点",
  "summary": "1-2句总结，不超过60字，综合智囊发言给真诚的洞察"
}

只返回 JSON，不要其他文字。`;

  const dialogueText = Array.isArray(agentDialogues) && agentDialogues.length > 0
    ? agentDialogues.map((d) => `${d.name}: ${d.text}`).join('\n')
    : '（无智囊发言）';

  const changedInfo = changed
    ? `变卦：${changed.chineseName}（${changed.symbol}）- ${changed.judgement}`
    : '无变卦';

  const userPrompt = `用户问题：「${question}」

本卦：${original?.chineseName || '未知'}（${original?.symbol || ''}）
卦辞：${original?.judgement || ''}
象辞：${original?.image || ''}
爻辞：${lineText || ''}
${changedInfo}

智囊发言：
${dialogueText}

请生成卦象解读，严格 JSON 输出。`;

  try {
    const text = await callLLM(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 400, temperature: 0.9, timeout: 10000 }
    );

    if (!text) {
      return localResult;
    }

    // 提取 JSON
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return localResult;
    }

    const parsed = JSON.parse(match[0]);
    return {
      verse: parsed.verse || localResult.verse,
      framework: parsed.framework || localResult.framework,
      powerfulQuestion: parsed.powerfulQuestion || localResult.powerfulQuestion,
      summary: parsed.summary || localResult.summary,
      source: 'llm',
    };
  } catch (e) {
    console.warn('[yiJingEngine] interpretHexagram LLM 失败，降级到本地解读:', e.message);
    return localResult;
  }
}

/**
 * 本地兜底卦象解读
 */
function generateLocalInterpretation(hexagram, question) {
  const { original, changingLines } = hexagram;
  const hasChange = changingLines.length > 0;

  const verses = [
    '元亨利贞，顺天而行。',
    '潜龙勿用，待时而动。',
    '山重水复，柳暗花明。',
    '履霜坚冰至，顺时而动。',
    '天行健，君子以自强不息。',
  ];

  const frameworks = [
    '看三年累计差值，不是看一年数字。',
    '先做三个月验证，再 all in。',
    '三个数字要清楚：总量、占比、可承受亏损。',
    '把当下选择放回三到十年尺度看。',
    '设一个 deadline，逼自己做而不是想。',
  ];

  const questions = [
    '你担心的是"错过机会"，还是"选错"？',
    '如果已经做了决定，你会怎么告诉三个月后的自己？',
    '你心里其实已经有答案了，只是在等一个确认。',
    '把问题里的每个词拆开，每个词背后都藏着什么？',
    '最坏情况发生了，你扛得住吗？',
  ];

  const summaries = [
    `「${question}」— ${original?.name || '此卦'}示${hasChange ? '变动' : '安定'}之象。诸位智囊已各抒己见，关键在你自己。`,
    `${original?.chineseName || '此卦'}，${original?.judgement || ''} 此局无定论，唯有本心可知。`,
    `卦象${hasChange ? '有变' : '主静'}，${original?.image || ''} 顺势而为，方得始终。`,
  ];

  const idx = (original?.id || 0) % verses.length;
  return {
    verse: verses[idx],
    framework: frameworks[idx],
    powerfulQuestion: questions[idx],
    summary: summaries[idx % summaries.length],
    source: 'local',
  };
}

export default { castHexagram, getHexagram, interpretHexagram };
