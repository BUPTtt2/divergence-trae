/**
 * LLM JSON 输出容错提取
 *
 * 思考模型（doubao-seed-evolving 等）输出比 glm-4-flash 更长/更啰嗦，
 * maxTokens 截断或 markdown 包裹都会导致裸 JSON.parse 失败。
 * extractJsonText 返回"尽力修复后的 JSON 字符串"，调用方继续 JSON.parse 即可。
 *
 * 修复策略（按序尝试）：
 *   1. 剥离 markdown 代码块包裹
 *   2. 直接 JSON.parse
 *   3. 贪婪正则提取 {..} 后 parse
 *   4. 截断修复：从首个 { 扫描（跟踪字符串/转义状态），到顶层深度归零处截取；
 *      若扫描结束仍未闭合，按未闭合栈补齐 ']'/'}' 后 parse
 */

function stripMarkdown(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1].trim() : text.trim();
}

/** 扫描 JSON 文本，返回 { end, openStack }：end=最后一个顶层闭合位置（-1 表示未闭合） */
function scanStructure(text) {
  const openStack = [];
  let inString = false;
  let escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') openStack.push({ ch, pos: i });
    else if (ch === '}' || ch === ']') {
      const top = openStack.pop();
      if (!top) continue;
      const expected = top.ch === '{' ? '}' : ']';
      if (ch !== expected) {
        // 结构错乱（如截断在字符串中间），放弃精确修复
        return { end: -1, openStack: [] };
      }
      if (openStack.length === 0) return { end: i + 1, openStack: [] };
    }
  }
  if (inString) return { end: -1, openStack: [] }; // 截断在字符串中间，无法安全修复
  return { end: -1, openStack };
}

function tryParse(candidate) {
  if (!candidate) return null;
  try { JSON.parse(candidate); return candidate; } catch { return null; }
}

/**
 * @param {string} raw LLM 原始输出
 * @returns {string|null} 可被 JSON.parse 的字符串；完全无 JSON 结构时返回 null
 */
export function extractJsonText(raw) {
  const text = String(raw || '');
  if (!text) return null;

  // 1/2. 剥离 markdown 后直接 parse（完整输出场景）
  const stripped = stripMarkdown(text);
  const direct = tryParse(stripped);
  if (direct) return direct;

  // 3. 贪婪提取
  const greedy = stripped.match(/\{[\s\S]*\}/);
  const greedyParsed = tryParse(greedy?.[0]);
  if (greedyParsed) return greedyParsed;

  // 4. 截断修复
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  const body = stripped.slice(start);

  // 4a. 找最后一个顶层闭合点
  const { end } = scanStructure(body);
  if (end > 0) {
    const closed = tryParse(body.slice(0, end));
    if (closed) return closed;
  }

  // 4b. 补齐未闭合括号（body 去掉尾部残缺的 key/value 片段后闭合）
  let trimmed = body.replace(/,?\s*("[^"]*"|[\w-]+)\s*:?\s*$/, ''); // 尾部残缺 key/value
  trimmed = trimmed.replace(/,\s*$/, '');
  const { openStack } = scanStructure(trimmed);
  if (openStack.length > 0 || openStack.length === 0) {
    const closers = openStack.slice().reverse().map((o) => (o.ch === '{' ? '}' : ']')).join('');
    const repaired = tryParse(trimmed + closers);
    if (repaired) return repaired;
  }
  // 4c. 最后兜底：贪婪 match（哪怕 parse 会失败也返回，保持调用方原有报错行为）
  return greedy?.[0] || null;
}

export default { extractJsonText };
