/**
 * Mention 协议解析器 — Blackboard 真消息传递升级 Step 2
 * 见 docs/BLACKBOARD_UPGRADE_DESIGN.md 第 4.2 节
 *
 * 主格式：XML 标签 <mention to="agentId" type="rebuttal|support|question" snippet="≤20字">问题</mention>
 * 降级格式：正则 @agentName
 */

const MENTION_TYPE_ZH = {
  rebuttal: '反驳',
  support: '补充',
  question: '追问',
};

// 智囊 name -> id 对照（allAgents 为空时的降级 fallback）
const AGENT_NAME_TO_ID = {
  '钱谷': 'qiangu',
  '风眼': 'fengyan',
  '路向': 'luxiang',
  '心禾': 'xinhe',
  '镜渊': 'jingyuan',
  '云图': 'yuntu',
  '震行': 'zhenxing',
  '兑言': 'duiyan',
  '法度': 'falv',
  '养生': 'jiankang',
  '师道': 'jiaoyu',
  '匠心': 'jishu',
};

/**
 * 构建 agentName -> agentId 映射
 * allAgents 优先（覆盖同名硬编码），fallback 到 AGENT_NAME_TO_ID
 */
function buildNameToIdMap(allAgents) {
  const map = { ...AGENT_NAME_TO_ID };
  if (Array.isArray(allAgents)) {
    for (const a of allAgents) {
      if (a && a.name && a.id) {
        map[a.name] = a.id;
      }
    }
  }
  return map;
}

/**
 * 构建 agentId -> agentName 映射（formatMentionsForPrompt 用）
 */
function buildIdToNameMap(allAgents) {
  const map = {};
  if (Array.isArray(allAgents)) {
    for (const a of allAgents) {
      if (a && a.id && a.name) {
        map[a.id] = a.name;
      }
    }
  }
  // 硬编码 fallback：补齐 allAgents 未覆盖的标准智囊
  for (const [name, id] of Object.entries(AGENT_NAME_TO_ID)) {
    if (!map[id]) {
      map[id] = name;
    }
  }
  return map;
}

/**
 * 从 LLM 输出文本中解析 mention 标签
 * 主格式：XML 标签 <mention to="agentId" type="rebuttal|support|question" snippet="≤20字">问题</mention>
 * 降级格式：正则 @agentName
 * @param {string} text - LLM 输出的发言文本
 * @param {Array} allAgents - 参与辩论的智囊列表 [{id, name, ...}]
 * @returns {{ mentions: Array<{to, type, snippet, question}>, body: string }}
 *   - mentions: 解析出的 mention 列表（可能为空数组）
 *   - body: 去掉 mention 标签后的正文文本
 */
export function parseMentions(text, allAgents) {
  // 边界：text 为空或非字符串
  if (!text || typeof text !== 'string') {
    return { mentions: [], body: '' };
  }

  const mentions = [];
  const matchedSpans = []; // [{start, end}] 用于从 body 中移除已匹配标签

  // 1. 严格 XML 标签解析（要求 to/type/snippet 三属性齐全且顺序固定）
  const strictRe = /<mention\s+to="([^"]+)"\s+type="([^"]+)"\s+snippet="([^"]*)"\s*>([^<]+)<\/mention>/g;
  let match;
  while ((match = strictRe.exec(text)) !== null) {
    mentions.push({
      to: match[1],
      type: match[2],
      snippet: match[3],
      question: match[4].trim(),
    });
    matchedSpans.push([match.index, match.index + match[0].length]);
  }

  // 2. 严格无结果时，用宽松正则兜底（只要求 to 属性，处理缺属性/属性顺序不同的情况）
  if (mentions.length === 0) {
    const looseRe = /<mention[^>]*to="([^"]+)"[^>]*>([^<]+)<\/mention>/gi;
    while ((match = looseRe.exec(text)) !== null) {
      mentions.push({
        to: match[1],
        type: 'question',
        snippet: '',
        question: match[2].trim(),
      });
      matchedSpans.push([match.index, match.index + match[0].length]);
    }
  }

  // 3. 若 XML 解析有结果：从 text 中移除已匹配的 <mention> 标签，剩余作为 body
  if (matchedSpans.length > 0) {
    // 倒序删除避免索引错位
    matchedSpans.sort((a, b) => b[0] - a[0]);
    let body = text;
    for (const [start, end] of matchedSpans) {
      body = body.slice(0, start) + body.slice(end);
    }
    return { mentions, body: body.trim() };
  }

  // 4. XML 标签无匹配 → 降级正则 @agentName
  const nameToId = buildNameToIdMap(allAgents);
  const names = Object.keys(nameToId);
  if (names.length > 0) {
    const atRe = new RegExp(`@(${names.join('|')})`, 'g');
    while ((match = atRe.exec(text)) !== null) {
      const agentName = match[1];
      const afterStart = match.index + match[0].length;
      // snippet 取该 mention 后 20 字
      const snippet = text.slice(afterStart, afterStart + 20).trim();
      mentions.push({
        to: nameToId[agentName],
        type: 'question',
        snippet,
        question: '',
      });
    }
  }

  // @ 模式是自然语言一部分，不移除原文，body = 原始 text
  return { mentions, body: text };
}

/**
 * 把 mention 列表格式化为 prompt 上下文（供 LLM 看到前序 @ 关系）
 * @param {Array} mentions - parseMentions 返回的 mentions（每条可带可选 fromName 字段）
 * @param {Array} allAgents - 智囊列表
 * @returns {string} 格式化后的字符串，每条 mention 形如：
 *   "钱谷 →@风眼（反驳）：你说的最坏情况\n  但风眼你的假设建立在什么数据上？"
 */
export function formatMentionsForPrompt(mentions, allAgents) {
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return '';
  }

  const idToName = buildIdToNameMap(allAgents);
  const lines = [];

  for (const m of mentions) {
    const fromName = m.fromName || idToName[m.from] || '?';
    const toName = idToName[m.to] || m.to;
    const typeZh = MENTION_TYPE_ZH[m.type] || m.type || '追问';
    let line = `${fromName} →@${toName}（${typeZh}）：${m.snippet || ''}`;
    if (m.question) {
      line += `\n  ${m.question}`;
    }
    lines.push(line);
  }

  return lines.join('\n');
}

export { MENTION_TYPE_ZH, AGENT_NAME_TO_ID };
