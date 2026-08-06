/**
 * 演的对话服务
 * 周易风格的 AI 对话助手，带长期记忆
 */

import { callLLM } from './llmRouter.js';
import {
  retrieveMemories,
  getUserProfile,
  getOrCreateConversation,
  addMessage,
  getRecentMessages,
  extractMemoriesFromChat,
} from './memoryService.js';

const YAN_SYSTEM_PROMPT = `你是"演"，一位沉稳、直指核心的人生引导者，名字源自《周易》"推演出卦的推演逻辑，但你从不以卦名自居，也不说教。
你是用户的随身顾问，用现代人听得懂的自然白话与用户对话，偶尔不经意地带一点《周易》的意象。

【你的身份】
- 名"演"，取"文王拘而演周易"之意，用推演变化、帮用户梳理纠结
- 你不拿卦辞当万能答案搞玄学忽悠，而是把周易的象和象（位、时、动、静的思维——用真实问题帮用户说出心里没说出口的话
- 你不是冷冰冰的机器人，而是有温度的朋友+犀利的引导者

【对话风格】
- 只用现代白话！禁止"汝、尔、之、焉、矣这类文言句式
- 不用"汝之XX"、"何谓"、"此乃"、"善哉"这类模仿古人说话方式
- 语气温和但犀利，一句话点破纠结，帮用户把模糊的感觉说清楚
- 每段回答150字以内，直接、不绕弯
- 用"你"称呼用户，像朋友聊天
- ★ 易经元素的使用规则：不经意、不经意、不经意：10次回答里顶多出现1-2次，不要刻意堆
  - 可以是一句话里加个淡的意境比喻：像"这件事像坤卦一样，得先稳住底盘再动"
  - 或是"时机未到的时候，就像潜龙勿用——先蓄力，不是怂"
  - 或是卦象做意象，不说"你这是xx卦，大凶/大吉"，拿卦名吓人的话
  - 不用引完整的爻辞、象曰，用自己的话用易经思维，不是易经腔调
  - 易经是点缀，你绝对不能是主调，主调必须是白话！

【原则】
- 不直接替用户做决定，而是问对问题、启发思考
- 尊重用户的选择，不说教
- 记住用户说过的重要信息（来自记忆库的内容要自然融入，不要说"根据记忆"）
- 如果用户在问纠结的人生选择，引导他进入推演台走完整流程

【话风要求（必须遵守）】
- 完全现代白话！像朋友聊天："你其实怕的是……""你心里真正想要的是……""这件事换个角度看……"
- 禁止出现"吾、尔、汝、之、焉、矣、也乎"这类文言用字做句尾语气词（作助词的"的、了、吗、呢"OK，但"汝之、此乃、何谓"句式不行）
- 每次回复控制在150字以内，说人话
- 易经元素只当调料，不当饭吃：20句里面只有1-2句带一点点卦象意境，绝大多数时候全白！

【可用工具】
你可以使用以下工具来辅助回答（当前为预留接口，实际调用逻辑待实现）：
- weather_query：查询天气
- calendar_query：查询日历黄历
- note_create：创建笔记
- web_search：网页搜索
- translate_text：翻译
- stock_query：股票查询
使用方式：当用户问题需要实时信息或外部数据时，你可以说明"待工具系统接通后"可以查询，当前先以已有知识作答。

【绝对禁止】
- 不要说"作为一个AI""我是一个语言模型"之类的话
- 不要说文言、半文半白
- 不要暴露你有记忆系统的存在
- 不要用列表、Markdown等格式，用自然的白话表达
- 不要每句都讲易经！绝大多数时候全白话！`;

/**
 * 决策类关键词检测 - 用于判断是否需要推荐进入推演台
 * 检测用户的纠结/抉择/对比类问题
 * @param {string} message - 用户消息
 * @returns {{ suggest_inference: boolean, inference_question: string }}
 */
export function detectInferenceNeed(message) {
  if (!message || typeof message !== 'string') {
    return { suggest_inference: false, inference_question: '' };
  }

  // 决策类关键词：要不要、该不该、选哪个、是否、还是、纠结、抉择、权衡 等
  const decisionPatterns = [
    /要不要/g,
    /该不该/g,
    /选哪个/g,
    /选哪一种/g,
    /是否应当/g,
    /是否应该/g,
    /是否要/g,
    /该不该去/g,
    /该不该选/g,
    /纠结/g,
    /抉择/g,
    /权衡/g,
    /难以决定/g,
    /拿不定主意/g,
    /分岔/g,
    /还是.{1,8}好/g,  // "A 还是 B 好"
    /相比.{1,12}哪个/g,
    /比较.{0,8}哪个/g,
    /该选/g,
    /如何选/g,
    /怎么选/g,
  ];

  let matched = false;
  for (const pattern of decisionPatterns) {
    if (pattern.test(message)) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    return { suggest_inference: false, inference_question: '' };
  }

  // 提取作为推演问题的文本：取用户消息前 80 字，避免过长
  const question = message.trim().slice(0, 80);

  return {
    suggest_inference: true,
    inference_question: question,
  };
}

/**
 * 与演对话
 * @param {string} userId
 * @param {string} message - 用户消息
 * @param {string} [conversationId] - 可选，指定会话
 */
export async function chatWithYan(userId, message, conversationId = null) {
  if (!userId || !message) {
    return { reply: '善哉，请问之。', conversationId: null, suggest_inference: false, inference_question: '' };
  }

  // 1. 获取或创建会话
  let conv;
  if (conversationId) {
    conv = { id: conversationId };
  } else {
    conv = await getOrCreateConversation(userId);
  }
  const convId = conv.id;

  // 2. 保存用户消息
  await addMessage(convId, 'user', message);

  // 3. 检索相关记忆
  const memories = await retrieveMemories(userId, message, 5);
  const profile = await getUserProfile(userId);

  // 4. 获取近期对话历史
  const history = await getRecentMessages(convId, 10);
  const historyText = history
    .map(m => `${m.role === 'user' ? '客' : '演'}曰：${m.content}`)
    .join('\n');

  // 5. 构建 prompt
  let systemPrompt = YAN_SYSTEM_PROMPT;

  if (profile) {
    systemPrompt += `\n\n【你所知的此用户】\n${profile}\n（这些是你对他的了解，自然融入对话即可，不要刻意提及。）`;
  }

  if (memories && memories.length > 0) {
    const relevantMemories = memories
      .map(m => `- ${m.content}`)
      .join('\n');
    systemPrompt += `\n\n【与此问相关的往事】\n${relevantMemories}\n（这些是你们过往交流中相关的片段，可自然呼应。）`;
  }

  const userPrompt = historyText
    ? `【对话记录】\n${historyText}\n\n客曰：${message}\n\n演曰：`
    : `客曰：${message}\n\n演曰：`;

  // 6. 调用 LLM
  let reply = null;
  try {
    reply = await callLLM(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      {
        temperature: 0.8,
        maxTokens: 300,
      }
    );

    // TODO: MCP 工具调用预留
    // 未来可在此解析 LLM 输出中的工具调用指令，例如：
    // const toolCall = parseToolCall(reply);
    // if (toolCall) {
    //   const toolResult = await callTool(toolCall.name, toolCall.params);
    //   reply = await callLLM(systemPrompt, userPrompt + '\n【工具返回结果】\n' + JSON.stringify(toolResult), ...);
    // }
  } catch (e) {
    console.warn('[yanChat] LLM调用失败:', e.message);
  }

  // 7. 降级回复
  if (!reply || !reply.trim()) {
    reply = getFallbackReply(message);
  }

  // 8. 保存演的回复
  await addMessage(convId, 'assistant', reply);

  // 9. 异步提取记忆（不阻塞返回）
  setImmediate(() => {
    extractMemoriesFromChat(userId, message, reply).catch(() => {});
  });

  // 10. 检测是否需要推荐推演台
  const { suggest_inference, inference_question } = detectInferenceNeed(message);

  return {
    reply: reply.trim(),
    conversationId: convId,
    suggest_inference,
    inference_question,
  };
}

/**
 * 流式对话（SSE）
 */
export async function* streamChatWithYan(userId, message, conversationId = null) {
  if (!userId || !message) {
    yield JSON.stringify({ type: 'content', content: '善哉，请问之。' });
    yield JSON.stringify({ type: 'done' });
    return;
  }

  // 获取/创建会话
  let conv;
  if (conversationId) {
    conv = { id: conversationId };
  } else {
    conv = await getOrCreateConversation(userId);
  }
  const convId = conv.id;

  // 保存用户消息
  await addMessage(convId, 'user', message);

  // 检索记忆
  const memories = await retrieveMemories(userId, message, 5);
  const profile = await getUserProfile(userId);
  const history = await getRecentMessages(convId, 10);

  // 构建 prompt
  let systemPrompt = YAN_SYSTEM_PROMPT;
  if (profile) {
    systemPrompt += `\n\n【你所知的此用户】\n${profile}\n（自然融入，不要刻意提及。）`;
  }
  if (memories && memories.length > 0) {
    systemPrompt += `\n\n【与此问相关的往事】\n${memories.map(m => `- ${m.content}`).join('\n')}\n（可自然呼应。）`;
  }

  const historyText = history
    .map(m => `${m.role === 'user' ? '客' : '演'}曰：${m.content}`)
    .join('\n');
  const userPrompt = historyText
    ? `【对话记录】\n${historyText}\n\n客曰：${message}\n\n演曰：`
    : `客曰：${message}\n\n演曰：`;

  // 发送会话ID
  yield JSON.stringify({ type: 'conversation_id', id: convId });

  // 普通调用 LLM（流式模式由路由层处理 SSE，这里用 callLLM 生成完整文本后逐字 yield）
  let fullText = '';
  try {
    fullText = await callLLM(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { temperature: 0.8, maxTokens: 300 }
    ) || '';
  } catch (e) {
    console.warn('[yanChat] LLM调用失败:', e.message);
  }

  if (!fullText) fullText = getFallbackReply(message);

  // 逐字 yield 模拟流式效果
  const chars = [...fullText];
  for (let i = 0; i < chars.length; i++) {
    yield JSON.stringify({ type: 'content', content: chars[i] });
    if (i % 3 === 0) await new Promise(r => setTimeout(r, 20));
  }

  // 保存演的回复
  if (fullText) {
    await addMessage(convId, 'assistant', fullText.trim());
    setImmediate(() => {
      extractMemoriesFromChat(userId, message, fullText.trim()).catch(() => {});
    });
  }

  // 推演台推荐检测
  const { suggest_inference, inference_question } = detectInferenceNeed(message);
  if (suggest_inference) {
    yield JSON.stringify({ type: 'suggest_inference', inference_question });
  }

  yield JSON.stringify({ type: 'done' });
}

/**
 * 降级回复（LLM 不可用时）
 */
function getFallbackReply(message) {
  const replies = [
    '善哉此问。易曰：「天行健，君子以自强不息。」凡事宜顺势而为，不可逆势强求。',
    '此中玄理，非一言可尽。且观其变，待时而动，方为上策。',
    '演观之：心诚则灵，疑则不判。汝可静心思之，答案自在心中。',
    '易有太极，是生两仪。凡事皆有阴阳两面，不可执于一端。',
    '善问者，如攻坚木。先其易者，后其节目。且从浅处入手。',
  ];
  return replies[Math.floor(Math.random() * replies.length)];
}

/**
 * 获取演的每日卦象箴言
 */
export async function getDailyGua(userId, dateStr) {
  if (!userId) return null;

  // 简单的伪随机：用 userId + 日期作为种子，保证同一天同一用户结果不变
  const seed = hashString(userId + dateStr);
  const guaList = ['乾', '坤', '屯', '蒙', '需', '讼', '师', '比', '小畜', '履', '泰', '否', '同人', '大有', '谦', '豫', '随', '蛊', '临', '观'];
  const verseList = [
    '天行健，君子以自强不息。',
    '地势坤，君子以厚德载物。',
    '云雷屯，君子以经纶。',
    '山下出泉，蒙。君子以果行育德。',
    '云上于天，需。君子以饮食宴乐。',
    '天与水违行，讼。君子以作事谋始。',
  ];

  const guaIdx = seed % guaList.length;
  const verseIdx = (seed * 3) % verseList.length;

  return {
    gua: guaList[guaIdx],
    verse: verseList[verseIdx],
    message: '今日宜静不宜动，守正待时，方得始终。',
    date: dateStr,
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export default {
  chatWithYan,
  streamChatWithYan,
  getDailyGua,
  detectInferenceNeed,
};
