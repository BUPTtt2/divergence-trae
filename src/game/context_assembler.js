/**
 * context_assembler.js — 统一所有记忆读取 + 上下文裁剪
 * 按文档07裁剪策略：persona/焦点 → Case File → 历史claims → 历史对话（先砍低优先级）
 * 所有Agent读记忆必须走这里，禁止裸读localStorage
 */

// ============ 预算配置（严格硬编码，代码说的算） ============
const BUDGET = {
  TOTAL_CHARS: 12000,        // 单次组装总字符上限（约3k tokens）
  PERSONA_MAX: 1800,         // persona+焦点+价值观优先级最高，不裁
  CASE_FILE_MAX: 4000,       // Case File保留上限
  CLAIMS_MAX: 2500,          // 主张清单（最近N条）
  HISTORY_MAX: 3000,         // 对话历史（最近M轮）
  MEMORY_L1_MAX: 1500,       // L1相似历史卡片
  BIO_L2_MAX: 2000,          // L2传记（常驻加载，2k硬上限）
};

// L2传记 KEY（localStorage）
const BIO_L2_KEY = 'divergence_l2_bio_v1';

/**
 * 读取五层记忆（纯前端MVP版，不用Mem0）
 * L0 工作记忆：调用方传入的本会话state
 * L1 情节记忆：卡片+时近+关键词召回
 * L2 传记：≤2k活文档，常驻加载（永不走检索）
 * L3 程序：persona版本/反馈权重
 * L4 市集：统计类，有需要再加
 */
export function readMemoryLayers({ questionText = '', keywords = [], topK = 3 } = {}) {
  let bioL2 = '';
  let personaVersion = 'v1';
  let feedbackWeights = {};
  try { bioL2 = localStorage.getItem(BIO_L2_KEY) || ''; } catch {}
  try {
    const meta = JSON.parse(localStorage.getItem('divergence_l3_meta_v1') || '{}');
    personaVersion = meta.personaVersion || 'v1';
    feedbackWeights = meta.feedbackWeights || {};
  } catch {}
  // L1：从历史卡片里按关键词召回（简化：关键词匹配+时近排序）
  const l1Cards = recallRelevantL1(questionText, keywords, topK);
  return { bioL2, personaVersion, feedbackWeights, l1Cards };
}

// L1情节记忆召回
function recallRelevantL1(questionText = '', keywords = [], topK = 3) {
  try {
    const all = JSON.parse(localStorage.getItem('divergence_l1_cards_v1') || '[]');
    if (!Array.isArray(all) || all.length === 0) return [];
    const kws = (keywords || []).filter(Boolean).map(k => k.toLowerCase());
    const qLow = (questionText || '').toLowerCase();
    const scored = all.map(card => {
      let score = 0;
      const text = `${card.question || ''} ${card.choiceLabel || ''} ${card.summary || ''}`.toLowerCase();
      if (kws.length > 0) {
        for (const kw of kws) if (text.includes(kw)) score += 5;
      }
      if (qLow && text) {
        const qWords = qLow.split(/\s+/).filter(w => w.length >= 2);
        for (const w of qWords) if (text.includes(w)) score += 2;
      }
      // 时近加权：越新分越高
      const ageDays = card.savedAt ? Math.max(0, (Date.now() - new Date(card.savedAt).getTime()) / 86400000) : 9999;
      score += Math.max(0, 10 - ageDays * 0.3);
      return { ...card, _score: score };
    });
    scored.sort((a, b) => b._score - a._score);
    return scored.slice(0, topK).map(({ _score, ...c }) => c);
  } catch {
    return [];
  }
}

// L2传记写入（蒸馏用：会话结束写）
export function writeL2Bio(deltaText) {
  try {
    const cur = localStorage.getItem(BIO_L2_KEY) || '';
    const next = (cur ? cur + '\n' : '') + deltaText;
    const trimmed = next.length > BUDGET.BIO_L2_MAX
      ? next.slice(next.length - BUDGET.BIO_L2_MAX)
      : next;
    localStorage.setItem(BIO_L2_KEY, trimmed);
    return true;
  } catch { return false; }
}

// L1卡片写入（命牌保存时调用）
export function writeL1Card(card) {
  try {
    const key = 'divergence_l1_cards_v1';
    const all = JSON.parse(localStorage.getItem(key) || '[]');
    all.unshift({ ...card, savedAt: new Date().toISOString() });
    // 最多存50张，超过了按时间倒序淘汰
    const trimmed = all.slice(0, 50);
    localStorage.setItem(key, JSON.stringify(trimmed));
    return true;
  } catch { return false; }
}

/**
 * 按裁剪优先级组装Agent上下文，返回严格长度受限的字符串
 * 输入：{ persona, caseFile, claims, dialogHistory, memoryLayers, extraFocus }
 * 输出：组装好的上下文字符串，长度≤TOTAL_CHARS
 */
export function assembleAgentContext({
  persona = '',
  focus = '',
  caseFile = null,
  claims = [],
  dialogHistory = [],
  memoryLayers = null,
  extraSection = null,
}) {
  const pieces = [];
  let used = 0;

  // ============ 1. 最高优先级：persona + 焦点 + 价值观（不裁） ============
  const personaBlock = buildPersonaBlock(persona, focus, memoryLayers);
  if (personaBlock.length > 0) {
    const len = Math.min(personaBlock.length, BUDGET.PERSONA_MAX);
    pieces.push(personaBlock.slice(0, len));
    used += len;
  }

  // ============ 2. 次高：Case File结构化内容 ============
  const caseBlock = buildCaseFileBlock(caseFile);
  const caseBudget = BUDGET.CASE_FILE_MAX;
  if (caseBlock.length > 0) {
    const take = Math.min(caseBlock.length, caseBudget);
    pieces.push(caseBlock.slice(0, take));
    used += take;
  }

  // ============ 3. 次低：主张清单（按时间倒序最近N条） ============
  const claimsBlock = buildClaimsBlock(claims);
  const claimsBudget = Math.min(BUDGET.CLAIMS_MAX, Math.max(0, BUDGET.TOTAL_CHARS - used));
  if (claimsBlock.length > 0 && claimsBudget > 0) {
    const take = Math.min(claimsBlock.length, claimsBudget);
    pieces.push(claimsBlock.slice(0, take));
    used += take;
  }

  // ============ 4. 最低：对话历史（最近M轮，每轮最多200字） ============
  const histBlock = buildDialogHistoryBlock(dialogHistory);
  const histBudget = Math.min(BUDGET.HISTORY_MAX, Math.max(0, BUDGET.TOTAL_CHARS - used));
  if (histBlock.length > 0 && histBudget > 0) {
    const take = Math.min(histBlock.length, histBudget);
    pieces.push(histBlock.slice(histBlock.length - take));
    used += take;
  }

  // ============ 5. 还有剩余预算：补L1相似历史卡片 ============
  const memBudget = Math.max(0, BUDGET.TOTAL_CHARS - used);
  if (memoryLayers?.l1Cards?.length > 0 && memBudget > 100) {
    const memBlock = buildMemoryBlock(memoryLayers.l1Cards);
    const take = Math.min(memBlock.length, memBudget);
    if (take > 50) {
      pieces.push(memBlock.slice(0, take));
    }
  }

  // 6. 额外section（如"已知信息不许重问清单"）
  if (extraSection) {
    const remain = BUDGET.TOTAL_CHARS - pieces.reduce((s, p) => s + p.length, 0);
    if (remain > 50) pieces.push(extraSection.slice(0, remain));
  }

  return pieces.filter(Boolean).join('\n\n---\n\n');
}

function buildPersonaBlock(persona, focus, memory) {
  const lines = [];
  if (persona) lines.push(`【身份与风格】\n${persona}`);
  if (memory?.bioL2) lines.push(`【传记 L2（常驻）】\n${memory.bioL2.slice(0, BUDGET.BIO_L2_MAX)}`);
  if (focus) lines.push(`【本案焦点】\n${focus}`);
  if (memory?.personaVersion) lines.push(`【版本】persona ${memory.personaVersion}`);
  return lines.join('\n\n');
}

function buildCaseFileBlock(caseFile) {
  if (!caseFile) return '';
  const lines = ['【结构化档案 Case File】'];
  lines.push(`核心问题：${caseFile.question || '未填写'}`);
  if (caseFile.branchA && caseFile.branchB) {
    lines.push(`二选一分支：A=${caseFile.branchA} ｜ B=${caseFile.branchB}`);
  }
  if (caseFile.timePressure) lines.push(`时间压力/截止：${caseFile.timePressure}`);
  if (caseFile.maxCost) lines.push(`能承受的最坏代价/成本：${caseFile.maxCost}`);
  if (caseFile.people) lines.push(`关键人物/影响面：${caseFile.people}`);
  if (Array.isArray(caseFile.values) && caseFile.values.length > 0) {
    lines.push(`用户价值观优先级：${caseFile.values.join(' > ')}`);
  }
  if (caseFile.missingInfo && caseFile.missingInfo.length > 0) {
    lines.push(`⚠️ 仍缺失信息：${caseFile.missingInfo.join('、')}`);
  }
  return lines.join('\n');
}

function buildClaimsBlock(claims) {
  if (!Array.isArray(claims) || claims.length === 0) return '';
  const lines = ['【主张清单 Claims（最近N条，按时间倒序）】'];
  const reversed = [...claims].reverse().slice(0, 10);
  for (const c of reversed) {
    const tag = c.stance === 'pro' ? '支持' : c.stance === 'con' ? '反对' : '中立';
    const cond = c.condition ? `（条件：${c.condition}）` : '';
    lines.push(`#${c.id} [${c.agentId}|${tag}]${cond}: ${c.text}`);
  }
  return lines.join('\n');
}

function buildDialogHistoryBlock(history) {
  if (!Array.isArray(history) || history.length === 0) return '';
  const lines = ['【对话历史（最近M轮）】'];
  const recent = history.slice(-12);
  for (const h of recent) {
    const who = h.role === 'user' ? '你' : h.agentId || '演';
    const text = typeof h.text === 'string' ? h.text : JSON.stringify(h.text);
    lines.push(`${who}：${text.slice(0, 200)}`);
  }
  return lines.join('\n');
}

function buildMemoryBlock(l1Cards) {
  const lines = ['【历史相似命牌 L1】'];
  for (const c of l1Cards.slice(0, 3)) {
    const date = c.savedAt ? new Date(c.savedAt).toLocaleDateString() : '';
    lines.push(`- ${date} 问「${(c.question || '').slice(0, 20)}」选了「${c.choiceLabel || ''}」：${(c.summary || '').slice(0, 80)}`);
  }
  return lines.join('\n');
}

/**
 * 生成"已知信息不许重问"清单 —— 圆桌实例强制注入，避免重复提问
 * （文档07的要求：圆桌实例强制带"已知信息不许重问"清单）
 */
export function buildDoNotRepeat(caseFile, dialogHistory) {
  if (!caseFile && (!Array.isArray(dialogHistory) || dialogHistory.length < 3)) return '';
  const lines = ['【严禁重复提问清单 —— 以下信息已确认，不许再问一遍】'];
  let count = 0;
  if (caseFile?.branchA && caseFile?.branchB) {
    lines.push(`- 二选一方向已明确：A vs B 选项，不许再问"你到底在纠结什么"`);
    count++;
  }
  if (caseFile?.timePressure) {
    lines.push(`- 时间窗口/截止日期已确认：${caseFile.timePressure.slice(0, 40)}`);
    count++;
  }
  if (caseFile?.maxCost) {
    lines.push(`- 代价承受上限已确认：${caseFile.maxCost.slice(0, 40)}`);
    count++;
  }
  if (Array.isArray(dialogHistory) && dialogHistory.length > 2) {
    const userAns = dialogHistory.filter(h => h.role === 'user').slice(-3);
    for (const a of userAns) {
      const text = (typeof a.text === 'string' ? a.text : '').slice(0, 50);
      if (text) {
        lines.push(`- 用户刚才回答过：「${text}」`);
        count++;
      }
    }
  }
  if (count === 0) return '';
  lines.push('\n重复以上任何一项 = 本次回答质量差评。');
  return lines.join('\n');
}

export default { assembleAgentContext, readMemoryLayers, writeL1Card, writeL2Bio, buildDoNotRepeat, BUDGET };
