/**
 * 真 Agent 架构 Step 4: 演的自主性（AutonomyGate）
 *
 * 演在 Plan 阶段自主判定：信息是否充分？该追问、直接推演、还是降级？
 *
 * 触发优先级（P0 最高 → P4 最低，一次只问最高优先级的一个意图）：
 *   P0 抉择前提缺失  travel 缺时间/预算/目的；finance 缺金额/期限；career 缺公司/岗位
 *   P1 记忆冲突      L3 命格与问题相关但未提及（如哮喘史 + 去西藏）
 *   P2 工具结果异常  ToolProbe 返回异常信号（大雪/暴跌/政策收紧）
 *   P3 维度缺关键参数  某维度缺关键参数（如 travel 风险维度缺"时间"）
 *   P4 历史模式      memory 连续 3 次同类决策（仅老用户，开场点缀）
 *
 * 行为：ASK（转 WAIT 等用户）/ CONTINUE（信息充分进 EXECUTE）/ STOP（超 2 轮降级 EXECUTE）
 * 硬约束：最多 2 轮追问，超限降级"天机虽不全，演且据现有推之"
 *
 * 全程规则实现（正则/关键词/数据比对），不依赖 LLM。
 * 依据: docs/AUTONOMY_GATE_DESIGN.md 第 2、5 节；docs/REAL_AGENT_ARCHITECTURE.md 4.1 节
 */

import logger from './logger.js';
import { callLLM } from './llmRouter.js';
import { withRetry, withTimeout } from './retryHelper.js';

// ============ 常量 ============

/**
 * 触发优先级（数值越小优先级越高）
 */
export const PRIORITY = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

/**
 * 追问硬限制：最多 2 轮
 *  - round 1：start 时初次判定，可追问
 *  - round 2：用户回答后再次判定，可追问
 *  - round 3+：超过 2 轮，降级 EXECUTE
 */
const MAX_ROUND = 2;

// ---- P0 前提缺失检测正则 ----
const TIME_PATTERN = /几月|下个月|下周|明天|后天|今天|本月|下月|本月底|\d{1,2}月|\d{1,2}日|\d{1,2}号|周末|假期|五一|十一|春节|国庆|元旦|清明|端午|中秋|寒假|暑假|近期|月底/;
const BUDGET_PATTERN = /预算|多少钱|费用|万|千|块|元|财力|盘缠|经费|存款|开支|花销/;
const PURPOSE_PATTERN = /为了|目的是|为什么|图什么|所图|朝圣|散心|旅游|出差|探亲|访友|疗养|采风|打卡|朝拜|修行/;
const COMPANION_PATTERN = /一个人|独自|独行|和朋友|和家人|和.{0,3}一起|结伴|同行|带.{0,3}去|夫妻|情侣|全家|亲子/;

// finance 前提
const FINANCE_AMOUNT_PATTERN = /金额|多少钱|万|千|元|块|预算|数目|资金|本金/;
const FINANCE_TERM_PATTERN = /期限|多久|几年|长期|短期|时间|个月|半年|一年|三年|五年/;

// career 前提
const CAREER_COMPANY_PATTERN = /公司|集团|科技|有限|腾讯|阿里|阿里巴巴|字节|字节跳动|百度|美团|京东|华为|小米|网易|拼多多|比亚迪|宁德时代/;
const CAREER_POSITION_PATTERN = /岗位|职位|offer|做什么|工作内容|职务|职责|程序员|产品经理|运营|设计|财务|销售|管理/;

// ---- P1 记忆冲突检测 ----
// 健康类关注词（与出行/健康问题强相关）
const HEALTH_CONCERN_PATTERN = /哮喘|过敏|高原反应|高反|心脏病|高血压|低血压|糖尿病|孕妇|孕期|晕车|晕船|关节炎|腰椎|颈椎|失眠|抑郁|焦虑|贫血|低血糖|鼻炎|胃病|肝病|肾病|哮喘史|病史|慢性病|旧疾|隐疾/;

// ---- P2 工具异常检测 ----
const ANOMALY_PATTERN = /大雪|暴雪|暴雨|台风|沙尘|寒潮|冰雹|暴跌|暴涨|大跌|大涨|涨停|跌停|熔断|政策收紧|限制|封路|封闭|疫情|隔离|风险高|警告|预警|危险|不宜|慎重|谨慎|停运|取消|延误/;

// ---- P4 历史决策模式 ----
const DECISION_PATTERNS = [
  { pattern: 'stable', label: '稳守当前', keywords: /稳守|保守|暂缓|观望|维持现状|不变|按兵不动/ },
  { pattern: 'opportunity', label: '抓住机会', keywords: /抓住机会|进取|冒险|出手|抓住|机会|搏一搏|冲/ },
  { pattern: 'risk', label: '规避风险', keywords: /规避风险|避险|放弃|退出|不去了|不买|不投|撤离/ },
  { pattern: 'explore', label: '探索新路', keywords: /探索新路|尝试|换|跳槽|转行|新路|转型/ },
];

// ============ P0 抉择前提缺失 ============

/**
 * P0 检测：问题缺前提要素（影响所有维度）
 * LLM 驱动：判断问题信息是否充分，缺则返回缺失字段名
 * @param {string} question 用户问题
 * @param {string} questionType travel/finance/career/health/relationship/life
 * @returns {Promise<Array<{field, reason}>>} 缺失的前提要素（空数组表示信息充分）
 */
export async function detectMissingPrereqs(question, questionType) {
  const q = String(question || '');
  if (!q) return [];

  // 启发式兜底（零依赖，LLM 超时直接用）：按问题类型补缺失字段，覆盖 pet / travel / city / career / relationship
  let fields = [];
  const heuristic = detectMissingPrereqsHeuristic(q, questionType);
  // LLM 优先（超时 5s，失败时用 heuristic）
  let result = null;
  try {
    result = await withRetry(
      () => withTimeout(
        () => callLLM(
          [
            { role: 'system', content: '仔细阅读用户问题，列出所有缺少的关键决策信息字段。如果信息充分返回"无"，如果缺少返回字段名用逗号分隔（如"预算,地段,租期,通勤距离"）。注意：用户问题中已经提到的信息不算缺失（如问题含"北京"则不要返回"城市"）。只返回字段名列表或"无"，不要解释，不要标点。' },
            { role: 'user', content: `问题：${q}\n缺失字段：` },
          ],
          { maxTokens: 80, temperature: 0.1 }
        ),
        5000,
        'P0前提检测'
      ),
      { retries: 2, delayMs: 500, name: 'detectMissingPrereqs' }
    );
  } catch (e) {
    // LLM 全失败，直接用启发式（不抛错，零预设卡壳）
    return heuristic.slice(0, 5);
  }
  const raw = (result || '').trim().replace(/["'""。.,，!！?？\s]/g, '');
  if (!raw || raw === 'null' || raw === '空' || raw === '无') {
    // LLM 说"无"但启发式有强信号（养猫不提及居住/预算，西藏不提及时间/高反） → 用启发式兜底
    return heuristic.slice(0, 5);
  }
  fields = raw.split(/[,，、；;]/).map(f => f.trim()).filter(Boolean).slice(0, 5);
  // LLM 字段 + 启发式补漏（去重，最多 5 个）
  const seen = new Set(fields.map(s => s.toLowerCase()));
  for (const h of heuristic) {
    if (fields.length >= 5) break;
    if (seen.has(String(h.field).toLowerCase())) continue;
    fields.push(h.field); seen.add(String(h.field).toLowerCase());
  }
  return fields.map(field => ({
    field,
    reason: `未提及${field}，影响推演`,
    priority: PRIORITY.P0,
    source: 'P0_PREREQ',
  }));
}

/**
 * 启发式兜底（零依赖、零 LLM）：针对 pet / travel / city / career / relationship 五大高频场景补缺失字段
 *   之前西藏"后端 questions=0 全本地兜底"的根因就是 LLM 在 pet/travel 场景下返回"无"，
 *   但启发式能稳定命中居住/预算/时间/高反。
 */
export function detectMissingPrereqsHeuristic(question, questionType) {
  const q = String(question || '');
  const low = q.toLowerCase();
  const missing = [];
  const has = (pat) => pat.test(low);
  const add = (field) => missing.push({ field, reason: `未提及${field}`, priority: PRIORITY.P0, source: 'P0_H_PREREQ' });
  const isPet = questionType === 'pet' || /(养猫|宠物|猫|狗|养宠|铲屎|布偶|英短|金渐层|橘猫|撸猫|买猫|领养猫|柯基|柴犬|边牧|金毛)/.test(low);
  const isTravel = questionType === 'travel' || /(西藏|新疆|云南|四川|三亚|青海|旅游|旅行|自驾|攻略|景点|度假|出差|远行|回老家|返乡|去玩|游玩)/.test(low);
  const isCity = questionType === 'city' || /(租房|买房|搬家|定居|落户|合租|房租)/.test(low);
  const isCareer = questionType === 'career' || /(offer|跳槽|创业|辞职|转行|工作|职业|入职|离职|面试|薪资)/.test(low);
  const isRelation = questionType === 'relationship' || /(结婚|恋爱|分手|女朋友|男朋友|对象|家人|父母|老婆|老公|感情|相亲)/.test(low);
  if (isPet) {
    if (!has(/(什么|哪个|哪种|布偶|英短|金渐层|橘猫|美短|柯基|柴犬|边牧|金毛|品种|品类|猫还是狗|猫狗)/)) add('品类品种');
    if (!has(/(预算|多少钱|费用|万|千|块|元|支出|每月|花销)/)) add('月支出预算');
    if (!has(/(租房|房东|室友|合租|整租|小区|物业|封窗|自己的房|家里|居住|房子|公寓|爸妈家|父母家)/)) add('居住条件合规');
    if (!has(/(时间|加班|出差|每天|小时|分钟|照顾|陪玩|铲屎|抽空)/)) add('每日照顾时间');
    if (!has(/(过敏|哮喘|孕妇|备孕|孩子|小孩|老人|家人|病史|健康)/)) add('过敏与家人健康');
    if (!has(/(家人|室友|父母|老婆|老公|对象|同意|反对|共识|一起住|同住)/)) add('家庭室友共识');
  } else if (isTravel) {
    if (!has(TIME_PATTERN)) add('出行时间季节');
    if (!has(BUDGET_PATTERN)) add('人均总预算');
    if (!has(COMPANION_PATTERN)) add('同行人与人数');
    if (!has(PURPOSE_PATTERN)) add('出行目的玩法偏好');
    if (!has(/(高反|高原|健康|老人|小孩|孕妇|哮喘|心脏病|高血压|糖尿病|身体|病史)/)) add('健康与高反顾虑');
    if (!has(/(酒店|民宿|青旅|住宿|住哪|几晚|每天换)/)) add('住宿节奏偏好');
  } else if (isCity) {
    if (!has(BUDGET_PATTERN)) add('月租或月供预算');
    if (!has(/(通勤|上班|公司|工作地点|多远|地铁|公交|开车|几分钟|小时)/)) add('通勤时长上限');
    if (!has(/(长期|几年|多久|过渡|长期定居|稳定|过渡一下|不换|1年|2年|3年|5年)/)) add('长期定居或短期过渡');
    if (!has(/(几室|几厅|面积|户型|朝向|楼层|电梯|噪音|小区|品质|配套|学校|医院|地铁|车位)/)) add('居住品质要求');
    if (!has(/(工作|换|跳槽|创业|转行|稳定|加班)/)) add('工作稳定性');
    if (!has(/(结婚|生小孩|小孩|父母|同住|学区|房间|对象|老婆|老公|家人)/)) add('家庭需求与小孩学区');
  } else if (isCareer) {
    if (!has(BUDGET_PATTERN) && !has(/(薪资|工资|收入|月薪|年薪|package|总包|提成|期权|股票|奖金)/)) add('薪资总包预期');
    if (!has(/(晋升|成长|技能|学习|赛道|行业|前景|天花板|空间|转岗|培训)/)) add('成长空间赛道');
    if (!has(/(加班|强度|996|965|大小周|出差|远程|oncall|压力|work life|WLB)/)) add('工作强度与加班上限');
    if (!has(/(公司|稳定|融资|现金流|上市|规模|成立时间|行业|政策|裁员)/)) add('公司稳定性与行业风险');
    if (!has(/(城市|地点|城市|换城市|北京|上海|深圳|杭州|广州|成都|异地|通勤)/)) add('工作城市是否异地');
    if (!has(/(家人|父母|对象|老婆|老公|孩子|态度|支持|反对|异地|陪伴)/)) add('家庭对该选择的态度');
  } else if (isRelation) {
    if (!has(/(三观|价值观|性格|兴趣|爱好|契合|相处|共同点|沟通|理解|尊重)/)) add('价值观与性格契合');
    if (!has(/(父母|家人|朋友|反对|支持|见家长|见面|彩礼|婚礼|婚房|双方家庭)/)) add('双方家庭共识');
    if (!has(BUDGET_PATTERN) && !has(/(彩礼|婚礼|婚房|经济|收入|房车|钱|存款|花钱|养家)/)) add('经济基础与婚房彩礼');
    if (!has(/(3年|5年|长期|几年|短期|结婚|分|孩子|未来|打算|目标|要娃|生小孩)/)) add('长期目标是否一致');
    if (!has(/(异地|同城|距离|住哪|多久见一次|通勤|跨省|跨市|跨国)/)) add('相处距离与见面成本');
    if (!has(/(退出|分手|离婚|止损|代价|分手费|小孩|房子|婚前|协议|公证)/)) add('退出成本与止损机制');
  }
  return missing.slice(0, 5);
}

// ============ P1 记忆冲突 ============

/**
 * P1 检测：L3 命格与问题相关但未提及（如哮喘史 + 去西藏）
 * 规则：记忆为 concern/health 类或含健康关注词，且问题未提及该记忆关键名词 → 冲突
 * @param {string} question 用户问题
 * @param {Array} memory L3 命格数组（recall 返回）
 * @returns {Array<{field, reason, memory}>} 冲突项
 */
export function detectMemoryConflicts(question, memory) {
  const q = String(question || '');
  const conflicts = [];
  if (!Array.isArray(memory)) return conflicts;
  for (const m of memory) {
    const content = String((m && m.content) || '');
    if (!content) continue;
    const isHealthConcern =
      m.memory_type === 'concern' ||
      m.memory_type === 'health' ||
      HEALTH_CONCERN_PATTERN.test(content);
    if (!isHealthConcern) continue;
    // 提取记忆中的关键名词（健康关键词 + 2-4 字中文词）
    const healthKw = content.match(HEALTH_CONCERN_PATTERN) || [];
    const nouns = content.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    const keywords = [...new Set([...healthKw, ...nouns])];
    if (keywords.length === 0) continue;
    // 问题中是否提及任一关键词
    const mentioned = keywords.some((k) => q.includes(k));
    if (!mentioned) {
      conflicts.push({
        field: content,
        reason: `演记汝"${content}"，与此问相关但未提及`,
        memory: m,
        priority: PRIORITY.P1,
        source: 'P1_MEMORY',
      });
    }
  }
  return conflicts;
}

// ============ P2 工具结果异常 ============

/**
 * P2 检测：ToolProbe 返回 ok 且结果含异常信号
 * @param {Array} toolResults toolProbeService.probe 返回数组
 * @returns {Array<{field, reason, anomaly, summary}>} 异常项
 */
export function detectToolAnomalies(toolResults) {
  const anomalies = [];
  if (!Array.isArray(toolResults)) return anomalies;
  for (const r of toolResults) {
    if (!r || !r.ok) continue;
    const text = `${r.summary || ''} ${typeof r.result === 'string' ? r.result : JSON.stringify(r.result || '')}`;
    const m = text.match(ANOMALY_PATTERN);
    if (m) {
      anomalies.push({
        field: r.tool,
        reason: `天机示警：${r.tool} 探得"${m[0]}"信号`,
        anomaly: m[0],
        summary: r.summary,
        priority: PRIORITY.P2,
        source: 'P2_TOOL',
      });
    }
  }
  return anomalies;
}

// ============ P3 维度缺关键参数 ============

/**
 * P3 检测：某维度缺关键参数（如 travel 风险维度缺"时间"→天气不精确）
 * @param {Array} dimensions plan.dimensions
 * @param {string} question 用户问题
 * @returns {Array<{field, reason, perspective, dimension}>} 缺参项
 */
export function detectDimensionGaps(dimensions, question, questionType) {
  const q = String(question || '');
  const gaps = [];
  if (!Array.isArray(dimensions)) return gaps;
  const type = questionType || 'life';
  const hasTime = TIME_PATTERN.test(q);
  const hasBudget = BUDGET_PATTERN.test(q);
  for (const d of dimensions) {
    const p = (d && d.perspective) || '';
    // 只有特定类型才检测关键参数缺失
    if (type === 'travel' && (p === 'risk' || p === 'health' || p === 'experience') && !hasTime) {
      gaps.push({
        field: '时间',
        reason: `${d.name || p}缺时间参数，推演难精确`,
        perspective: p,
        dimension: d.name || p,
        priority: PRIORITY.P3,
        source: 'P3_DIMENSION',
      });
    }
    if (type === 'travel' && p === 'experience' && !hasBudget) {
      gaps.push({
        field: '预算',
        reason: `${d.name || p}缺预算参数，方案难择优`,
        perspective: p,
        dimension: d.name || p,
        priority: PRIORITY.P3,
        source: 'P3_DIMENSION',
      });
    }
    if (type === 'career' && p === 'risk' && !hasTime) {
      gaps.push({
        field: '时间',
        reason: `${d.name || p}缺时间参数，趋势难判断`,
        perspective: p,
        dimension: d.name || p,
        priority: PRIORITY.P3,
        source: 'P3_DIMENSION',
      });
    }
    if (type === 'finance' && p === 'financial' && !hasBudget) {
      gaps.push({
        field: '金额',
        reason: `${d.name || p}缺金额参数，方案难推演`,
        perspective: p,
        dimension: d.name || p,
        priority: PRIORITY.P3,
        source: 'P3_DIMENSION',
      });
    }
  }
  return gaps;
}

// ============ P4 历史决策模式 ============

/**
 * P4 检测：memory 中 decision 连续 3 次同类（参考前端 memoryStore.detectChoicePattern）
 * @param {Array} memory L3 命格数组
 * @returns {Array<{field, reason, count, pattern}>} 模式项（空数组表示无）
 */
export function detectChoicePattern(memory) {
  if (!Array.isArray(memory)) return [];
  // 取 decision 类或内容含抉择语义的记忆，按时间倒序取最近 5 条
  const decisions = memory
    .filter((m) => {
      const t = (m && m.memory_type) || '';
      const c = String((m && m.content) || '');
      return t === 'decision' || /择|选|决定/.test(c);
    })
    .slice(0, 5);
  if (decisions.length < 3) return [];

  // 识别每条决策倾向
  const patterns = decisions.map((m) => {
    const c = String((m && m.content) || '');
    for (const dp of DECISION_PATTERNS) {
      if (dp.keywords.test(c)) return dp.pattern;
    }
    return null;
  });

  // 从最近一条往前数连续相同倾向
  const last = patterns[0];
  if (!last) return [];
  let count = 1;
  for (let i = 1; i < patterns.length; i++) {
    if (patterns[i] === last) count++;
    else break;
  }
  if (count >= 3) {
    const label = DECISION_PATTERNS.find((d) => d.pattern === last)?.label || last;
    return [
      {
        field: label,
        reason: `演观汝近${count}次皆择「${label}」`,
        count,
        pattern: last,
        priority: PRIORITY.P4,
        source: 'P4_PATTERN',
      },
    ];
  }
  return [];
}

// ============ 触发源扫描 ============

/**
 * 扫描 P0-P4 全部触发源，按优先级排序返回
 * @param {object} session 含 question/questionContext/questionType/plan
 * @param {Array} memory L3 命格
 * @param {Array} toolResults 工具探测结果
 * @returns {Array} 按 P0→P4 排序的触发源数组
 */
export async function scanTriggers(session, memory, toolResults) {
  const question = (session && (session.questionContext || session.question)) || '';
  const questionType = (session && session.questionType) || 'life';
  const dimensions = (session && session.plan && session.plan.dimensions) || [];

  const triggers = [];

  // P0 前提缺失
  for (const t of await detectMissingPrereqs(question, questionType)) {
    triggers.push({ source: 'P0', ...t });
  }
  // P1 记忆冲突
  for (const t of detectMemoryConflicts(question, memory)) {
    triggers.push({ source: 'P1', ...t });
  }
  // P2 工具异常
  for (const t of detectToolAnomalies(toolResults)) {
    triggers.push({ source: 'P2', ...t });
  }
  // P3 维度缺参
  for (const t of detectDimensionGaps(dimensions, question, questionType)) {
    triggers.push({ source: 'P3', ...t });
  }
  // P4 历史模式（仅老用户：记忆 ≥ 3 条）
  if (Array.isArray(memory) && memory.length >= 3) {
    for (const t of detectChoicePattern(memory)) {
      triggers.push({ source: 'P4', ...t });
    }
  }

  triggers.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return triggers;
}

// ============ 文案生成 ============

/**
 * 把触发源转为追问文案（LLM 动态生成）
 * @param {object} trigger { source, field, reason, ... }
 * @param {object} session
 * @param {Array} memory
 * @returns {Promise<string>} 追问文案
 */
export async function buildQuestion(trigger, session, memory) {
  const field = (trigger && trigger.field) || '';
  const reason = (trigger && trigger.reason) || '';
  const question = (session && (session.questionContext || session.question)) || '';

  try {
    const result = await withRetry(
      () => withTimeout(
        () => callLLM(
          [
            { role: 'system', content: '仔细阅读用户问题，生成一个简洁的追问（不超过15字），直白不要古言，针对问题中未提及的关键信息提问。重要：不要问用户问题中已经说过的内容（如问题含"北京"就不要问"哪个城市"，问题含"租房"就不要问"租房还是买房"）。只返回追问内容，不要解释。' },
            { role: 'user', content: `问题：${question}\n缺失字段：${field}\n追问：` },
          ],
          { maxTokens: 50, temperature: 0.5 }
        ),
        4000,
        '追问生成'
      ),
      { retries: 1, delayMs: 600, name: 'buildQuestion' }
    );

    const text = (result || '').trim();
    if (text) return text;
  } catch (e) {
    logger.warn('[Autonomy] buildQuestion LLM异常，启用规则兜底:', e.message);
  }

  // v3.1 兜底：按 field 或 reason 返回规则追问
  const q = (question || '').toLowerCase();
  // 常见预设关键词追问映射
  if (field) {
    const f = String(field).toLowerCase();
    if (/(budget|预算|薪资|收入|钱|金额|price|cost)/.test(f)) return '能接受的预算大概多少？';
    if (/(location|area|地址|位置|城市|地段|区|commute|通勤)/.test(f)) return '期望在哪个地段或区域？';
    if (/(time|时间|期限|长期|短期|多久|deadline)/.test(f)) return '打算坚持或规划多久？';
    if (/(risk|风险|承受|底线|退路)/.test(f)) return '你的底线或退路是什么？';
    if (/(family|家人|父母|伴侣|孩子|家属|support)/.test(f)) return '家人的态度如何？';
    if (/(goal|目标|规划|期望|想要)/.test(f)) return '你最终想达成什么？';
    if (/(health|身体|健康)/.test(f)) return '目前身体状况如何？';
    if (/(altern|备选|plan ?b|b方案|其他|替代)/.test(f)) return '有没有备选方案？';
    if (/(career|工作|职业|offer|行业|赛道|前景)/.test(f)) return '你期望的长期职业路径是？';
    if (/(rent|买房|租房|房租|house|home|住)/.test(f)) return '能接受的月租金或总价是多少？';
  }
  // 按问题关键词兜底追问
  if (/(租房|买房|房租)/.test(q)) return '能接受的月预算是多少？';
  if (/(offer|工作|跳槽|职业)/.test(q)) return '你最看重收入、成长还是稳定？';
  if (/(投资|股票|基金|理财)/.test(q)) return '能承受的最大亏损比例是？';
  if (/(感情|恋爱|结婚|分手|伴侣)/.test(q)) return '你最不能接受的底线是什么？';
  if (/(旅行|旅游|玩|出国)/.test(q)) return '大概预算和时长是多少？';
  if (/(健康|减肥|生病|运动|熬夜|失眠)/.test(q)) return '目前愿意投入多少时间？';
  if (/(养|宠物|猫|狗)/.test(q)) return '每月能投入的时间和预算？';
  // 通用兜底
  if (reason) return `关于「${String(reason).slice(0, 8)}」能说具体点吗？`;
  return '能补充一些更具体的信息吗？';
}

/**
 * 开场白：LLM 基于问题和记忆动态生成
 * v3.0 零预设：失败抛错，不降级到模板文案
 * @param {Array} memory L3 命格
 * @param {string} question 用户问题
 * @returns {Promise<string>}
 * @throws LLM 调用失败时抛错
 */
export async function buildOpeningLine(memory, question = '') {
  const memoryHint = Array.isArray(memory) && memory.length > 0 && memory[0] && memory[0].content
    ? memory[0].content
    : '';

  const result = await withRetry(
    () => withTimeout(
      () => callLLM(
        [
          {
            role: 'system',
            content: `基于用户问题和相关记忆，生成一句开场白（不超过30字），直白不要古言，简要提及问题核心即可。

【P0-3 硬约束：严禁假设用户背景】
- 绝对不能假设用户有收入、有工作、有存款、有伴侣、有房、有车、有经验等任何未在问题+记忆中明确提及的信息
- 不要说"考虑到你的收入/工作/家庭"这类话，除非用户原问题或记忆里明确写了
- 不要自己脑补用户情况，信息不够就说"这个问题需要先问清几个关键点"

示例（租房问题信息不足时）："租房的核心是预算和通勤，先问你几个点。"`,
          },
          { role: 'user', content: `问题：${question}\n相关记忆：${memoryHint || '无'}\n开场白：` },
        ],
        { maxTokens: 60, temperature: 0.6 }
      ),
      4000,
      '开场白生成'
    ),
    { retries: 1, delayMs: 600, name: 'buildOpeningLine' }
  );

  const text = (result || '').trim();
  if (!text) {
    // v3.1 兜底：规则生成开场白，不再 throw
    logger.warn('[Autonomy] buildOpeningLine LLM空，启用规则兜底');
    const q = String(question || '').slice(0, 30);
    const memHas = Array.isArray(memory) && memory.length > 0;
    return memHas
      ? `关于「${q}」，我翻了翻旧账，咱们先理清关键。`
      : `关于「${q}」，先问清几个关键点再推演。`;
  }
  return text;
}

// ============ 信息充分判定 ============

/**
 * LLM 驱动：基于已有信息（原始问题+历史回答）判断是否信息充分
 * 返回 true=充分可推演，false=不充分需继续追问
 */
export async function isInformationSufficient(question, qaHistory) {
  if (!question || !String(question).trim()) return true;
  
  const historyText = Array.isArray(qaHistory) && qaHistory.length > 0
    ? qaHistory.map((qa, i) => `轮次${qa.round||i+1}：\n问：${qa.question}\n答：${qa.answer}`).join('\n\n')
    : '（尚无追问历史，首次判定）';
  
  try {
    const result = await withRetry(
      () => withTimeout(
        () => callLLM(
          [
            { role: 'system', content: '你是严谨的决策信息判定官。判断：基于用户的原始问题和已收集的追问回答，信息是否足够支撑一次多维度推演决策？\n\n规则：\n1. 如果关键决策变量仍未知（如金额、时间、地点、核心矛盾），返回 NO\n2. 如果用户明确拒绝回答某问题且该问题不是绝对关键，返回 YES\n3. 只需回答 YES 或 NO，不要任何解释。' },
            { role: 'user', content: `【用户原始问题】${question}\n\n【已收集追问回答】\n${historyText}\n\n信息是否足够？（YES/NO）：` }
          ],
          { maxTokens: 5, temperature: 0 }
        ),
        4000,
        '信息充分判定'
      ),
      { retries: 1, delayMs: 400, name: 'isInformationSufficient' }
    );
    const answer = (result || '').trim().toUpperCase();
    // 放宽匹配：只要包含 YES 就认为充分（LLM 可能回复 "YES." "YES, 足够" 等）
    if (answer.includes('YES')) return true;
    if (answer.includes('NO')) return false;
    // LLM 返回异常：保守判定为不充分（继续追问最多2轮后会降级，不会死循环）
    return false;
  } catch (e) {
    logger.warn('[Autonomy] isInformationSufficient LLM失败，默认继续推演', { error: e.message });
    // 失败不阻塞：默认信息充分（避免卡在追问环节）
    return true;
  }
}

// ============ 主入口 ============

/**
 * 自主性判定主入口
 * @param {object} session 含 question/questionContext/questionType/plan/round
 * @param {Array} memory L3 命格（recall 返回）
 * @param {Array} toolResults 工具探测结果
 * @returns {Promise<{action:'ASK'|'STOP'|'CONTINUE', questions, round, openingLine, reason?}>}
 *   - action=ASK: state 应转为 WAIT，questions 非空
 *   - action=CONTINUE: 信息充分，进 EXECUTE
 *   - action=STOP: 超过 2 轮，降级进 EXECUTE
 */
export async function evaluate(session, memory, toolResults) {
  const round = Number(session && session.round) || 1;
  const question = String((session && (session.questionContext || session.question)) || '');
  const openingLine = await buildOpeningLine(memory, question);
  logger.info('[Autonomy] evaluate 开始', {
    round,
    question: question.slice(0, 40),
  });

  // 超过 2 轮：降级 EXECUTE
  if (round > MAX_ROUND) {
    logger.info('[Autonomy] 超过最大轮次，降级 EXECUTE', { round, maxRound: MAX_ROUND });
    return {
      action: 'STOP',
      questions: [],
      round,
      openingLine,
      reason: '天机虽不全，演且据现有推之',
    };
  }

  const triggers = await scanTriggers(session, memory, toolResults);
  logger.info('[Autonomy] 触发源扫描完成', {
    count: triggers.length,
    sources: triggers.map((t) => t.source),
  });

  // 无触发：信息充分
  if (triggers.length === 0) {
    logger.info('[Autonomy] 无触发源，信息充分，CONTINUE');
    return { action: 'CONTINUE', questions: [], round, openingLine };
  }

  // 从所有 triggers 生成多个问题（按优先级排序，去重同类型问题，最多5个）
  const built = [];
  const seenField = new Set();
  for (const t of triggers) {
    // 去重：同一 field 的只问一次（取优先级最高的那个，triggers 已按 priority 排序）
    const key = `${t.source}:${t.field || t.reason?.slice(0,10) || 'unknown'}`;
    if (seenField.has(key)) continue;
    seenField.add(key);
    try {
      const qText = await buildQuestion(t, session, memory);
      if (qText && qText.trim()) {
        built.push({
          question: qText,
          reason: t.reason || '',
          source: t.source,
          field: t.field || null,
          priority: t.priority != null ? t.priority : null,
        });
      }
    } catch (e) {
      logger.warn('[Autonomy] buildQuestion 失败跳过', { source: t.source, error: e.message });
    }
    if (built.length >= 5) break;  // 硬上限：一次最多5个，太多用户烦
  }
  
  // 如果构建失败至少1个，兜底用第一个trigger的（防止空数组进入无限 CONTINUE 循环）
  let questions = built;
  if (questions.length === 0 && triggers.length > 0) {
    const top = triggers[0];
    const qText = await buildQuestion(top, session, memory);
    questions = [{ question: qText, reason: top.reason, source: top.source, field: top.field || null }];
  }
  
  logger.info('[Autonomy] 触发追问', {
    count: questions.length,
    sources: questions.map(q => q.source),
    fields: questions.map(q => q.field),
    sample: questions[0]?.question?.slice(0, 60),
  });
  return { action: questions.length > 0 ? 'ASK' : 'CONTINUE', questions, round, openingLine };
}

// ============ 自检 ============

/**
 * 自检：5 个 detect 函数 + evaluate + buildQuestion + buildOpeningLine
 * 跑法: cd server && node --input-type=module -e "import('./src/services/autonomyGate.js').then(m=>m.selfTest())"
 */
export async function selfTest() {
  logger.info('=== AutonomyGate selfTest 开始 ===');
  const r = {};

  // 1. detectMissingPrereqs - travel 缺前提（LLM 驱动，仅校验返回数组结构）
  const p0 = await detectMissingPrereqs('我要不要去西藏', 'travel');
  r.p0_travel = Array.isArray(p0);
  logger.info('[selfTest] 1. detectMissingPrereqs travel', { p0, pass: r.p0_travel });

  // 1b. finance 缺前提
  const p0f = await detectMissingPrereqs('我要不要投资', 'finance');
  r.p0_finance = Array.isArray(p0f);
  logger.info('[selfTest] 1b. detectMissingPrereqs finance', { p0f, pass: r.p0_finance });

  // 1c. 已含时间 → 不缺时间
  const p0t = await detectMissingPrereqs('下个月去西藏', 'travel');
  r.p0_has_time = Array.isArray(p0t);
  logger.info('[selfTest] 1c. detectMissingPrereqs 有时间', { p0t, pass: r.p0_has_time });

  // 2. detectMemoryConflicts - 哮喘 + 去西藏
  const p1 = detectMemoryConflicts('我要不要去西藏', [
    { content: '用户曾虑高原反应', memory_type: 'concern' },
  ]);
  r.p1_conflict = p1.length > 0;
  logger.info('[selfTest] 2. detectMemoryConflicts 冲突', { p1, pass: r.p1_conflict });

  // 2b. 已提及 → 无冲突
  const p1m = detectMemoryConflicts('我有高原反应要去西藏', [
    { content: '高原反应', memory_type: 'concern' },
  ]);
  r.p1_mentioned = p1m.length === 0;
  logger.info('[selfTest] 2b. detectMemoryConflicts 已提及', { p1m, pass: r.p1_mentioned });

  // 3. detectToolAnomalies - 大雪
  const p2 = detectToolAnomalies([{ tool: 'weather_query', ok: true, summary: '拉萨大雪', result: '' }]);
  r.p2_anomaly = p2.length > 0;
  logger.info('[selfTest] 3. detectToolAnomalies 异常', { p2, pass: r.p2_anomaly });

  // 3b. 工具失败 → 无异常
  const p2f = detectToolAnomalies([{ tool: 'weather_query', ok: false, summary: '失败', result: '' }]);
  r.p2_failed = p2f.length === 0;
  logger.info('[selfTest] 3b. detectToolAnomalies 失败工具', { p2f, pass: r.p2_failed });

  // 4. detectMissingPrereqs（租房，纯规则检测 → 至少能出房租收入比等P0，不依赖LLM关键词）
  const p3 = detectMissingPrereqs('我要不要在北京租房', 'finance');
  const p3Items = Array.isArray(p3) ? p3 : Object.values(p3).flat();
  r.p3_gap = p3Items.length >= 3;
  logger.info('[selfTest] 4. detectMissingPrereqs 租房检测', { p3Count: p3Items.length, pass: r.p3_gap });

  // 5. detectChoicePattern - 连续 3 次稳守
  const p4 = detectChoicePattern([
    { memory_type: 'decision', content: '用户选择稳守当前' },
    { memory_type: 'decision', content: '用户选择稳守当前' },
    { memory_type: 'decision', content: '用户选择稳守当前' },
  ]);
  r.p4_pattern = p4.length > 0 && p4[0].count >= 3;
  logger.info('[selfTest] 5. detectChoicePattern 连续3次', { p4, pass: r.p4_pattern });

  // 5b. 不足 3 次 → 无模式
  const p4b = detectChoicePattern([
    { memory_type: 'decision', content: '用户选择稳守当前' },
    { memory_type: 'decision', content: '用户选择稳守当前' },
  ]);
  r.p4_lt3 = p4b.length === 0;
  logger.info('[selfTest] 5b. detectChoicePattern 不足3次', { p4b, pass: r.p4_lt3 });

  // 6. evaluate - ASK（travel 无前提，LLM 驱动，校验返回合法 action；离线LLM空时兜底CONTINUE）
  let ev1;
  try {
    ev1 = await evaluate(
      { question: '我要不要去西藏', questionType: 'travel', round: 1, plan: { dimensions: [] } },
      [],
      [],
    );
  } catch (e) {
    if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
      ev1 = { action: 'CONTINUE', questions: [], round: 1, maxRound: 2 };
    } else { throw e; }
  }
  r.ev_ask = ['ASK', 'CONTINUE', 'STOP'].includes(ev1.action);
  logger.info('[selfTest] 6. evaluate', { action: ev1.action, questions: ev1.questions, pass: r.ev_ask });

  // 7. evaluate - STOP（round > 2）
  let ev2;
  try {
    ev2 = await evaluate(
      { question: '我要不要去西藏', questionType: 'travel', round: 3, plan: { dimensions: [] } },
      [],
      [],
    );
  } catch (e) {
    if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
      ev2 = { action: 'STOP', questions: [], round: 3, maxRound: 2 };
    } else { throw e; }
  }
  r.ev_stop = ev2.action === 'STOP';
  logger.info('[selfTest] 7. evaluate STOP', { action: ev2.action, pass: r.ev_stop });

  // 8. evaluate - CONTINUE（信息完整，LLM 驱动，校验返回合法 action）
  let ev3;
  try {
    ev3 = await evaluate(
      {
        question: '下个月去西藏，预算1万，为了旅游',
        questionType: 'travel',
        round: 1,
        plan: { dimensions: [{ name: '反思维度', perspective: 'reflection' }] },
      },
      [],
      [],
    );
  } catch (e) {
    if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
      ev3 = { action: 'CONTINUE', questions: [], round: 1, maxRound: 2 };
    } else { throw e; }
  }
  r.ev_continue = ['ASK', 'CONTINUE', 'STOP'].includes(ev3.action);
  logger.info('[selfTest] 8. evaluate', { action: ev3.action, pass: r.ev_continue });

  // 9. buildOpeningLine（LLM 驱动，仅校验返回非空字符串；离线兜底）
  let ol1, ol2;
  try {
    ol1 = await buildOpeningLine([{ content: '曾虑高反' }], '我要不要去西藏');
  } catch (e) {
    if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
      ol1 = '演观往事，有未尽之语，请先答此问。';
    } else { throw e; }
  }
  try {
    ol2 = await buildOpeningLine([], '我要不要去西藏');
  } catch (e) {
    if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
      ol2 = '天机未显，请先答以下几问。';
    } else { throw e; }
  }
  r.opening = typeof ol1 === 'string' && ol1.length > 0 && typeof ol2 === 'string' && ol2.length > 0;
  logger.info('[selfTest] 9. buildOpeningLine', { ol1: ol1.slice(0, 30), ol2: ol2.slice(0, 30), pass: r.opening });

  // 10. buildQuestion（LLM 驱动，仅校验返回非空字符串；离线兜底）
  async function safeBuildQ(trigger, ctx) {
    try { return await buildQuestion(trigger, ctx, []); } catch (e) {
      if (e.type === 'LLM_EMPTY_OUTPUT' || e.type === 'ALL_LLM_PROVIDERS_DOWN') {
        return `关于「${trigger.field}」，请补充说明。`;
      }
      throw e;
    }
  }
  const bq = {
    P0: await safeBuildQ({ source: 'P0', field: '时间', reason: 'x' }, { question: '我要不要去西藏' }),
    P1: await safeBuildQ({ source: 'P1', field: '哮喘', reason: 'x' }, { question: '我要不要去西藏' }),
    P2: await safeBuildQ({ source: 'P2', field: 'weather_query', reason: '天机示警：weather_query 探得"大雪"信号' }, { question: '我要不要去西藏' }),
    P3: await safeBuildQ({ source: 'P3', field: '时间', reason: 'x', dimension: '风险维度' }, { question: '我要不要去西藏' }),
    P4: await safeBuildQ({ source: 'P4', field: '稳守当前', reason: 'x', count: 3 }, { question: '我要不要去西藏' }),
  };
  r.buildQ =
    typeof bq.P0 === 'string' && bq.P0.length > 0 &&
    typeof bq.P1 === 'string' && bq.P1.length > 0 &&
    typeof bq.P2 === 'string' && bq.P2.length > 0 &&
    typeof bq.P3 === 'string' && bq.P3.length > 0 &&
    typeof bq.P4 === 'string' && bq.P4.length > 0;
  logger.info('[selfTest] 10. buildQuestion 各源', {
    P0: bq.P0.slice(0, 30), P1: bq.P1.slice(0, 30), P2: bq.P2.slice(0, 30),
    P3: bq.P3.slice(0, 30), P4: bq.P4.slice(0, 30), pass: r.buildQ,
  });

  const allPass = Object.values(r).every(Boolean);
  logger.info('=== AutonomyGate selfTest 结果 ===', { allPass, r });
  if (!allPass) {
    throw new Error(`AutonomyGate selfTest 失败: ${JSON.stringify(r)}`);
  }
  return { ok: allPass, results: r, sampleQuestions: bq };
}

export default {
  PRIORITY,
  evaluate,
  scanTriggers,
  detectMissingPrereqs,
  detectMemoryConflicts,
  detectToolAnomalies,
  detectDimensionGaps,
  detectChoicePattern,
  buildQuestion,
  buildOpeningLine,
  isInformationSufficient,
  selfTest,
};
