/**
 * 真 Agent 架构 Step 3: 演侧工具调用服务（ToolProbe）
 *
 * 演在 Plan 阶段"窥探天机"——根据问题类型确定性映射工具清单，
 * 并行调用 mcpService.executeTool 拿实时数据，失败降级为"天机未明"。
 *
 * 设计依据：docs/REAL_AGENT_ARCHITECTURE.md 4.4 节
 *  - 4.4.2 演侧工具调用不走 LLM function calling，演直接决定调哪个工具
 *  - 4.4.4 工具清单：medical_query/policy_query/route_query 在 mcpService 不存在，
 *                  统一用 web_search 兜底（travel→搜"目的地 风险/政策"）
 *
 * 接口：
 *  - detectToolNeeds(question, questionType) → string[]  工具名去重数组
 *  - buildProbeArgs(toolName, question, questionType) → object  工具参数
 *  - probe(question, questionType) → Array<{tool, args, result, summary, ok}>
 *
 * 降级策略：
 *  - 单工具失败：ok:false, summary:'天机未明（{工具名}探测失败）'，不抛错
 *  - 总耗时硬限制 6s，超时则放弃未完成的，返回已完成的 + 超时标注
 */

import { executeEvidenceTool, getAgentToolRegistry } from './toolEvidenceGateway.js';
import logger from './logger.js';

// ============ 常量 ============

const PROBE_TOTAL_TIMEOUT_MS = 6000;

/**
 * 危险工具清单（HITL 人工确认拦截）
 * 涉及医疗/法律的工具不直接执行，返回 needApproval 让演感知未被执行
 */
const DANGEROUS_TOOLS = ['medical_query', 'legal_query'];
const AGENT_TOOL_REGISTRY = getAgentToolRegistry();

/**
 * 问题类型 → 工具清单（确定性映射）
 * 注：medical/policy/route 在 mcpService 不存在，统一用 web_search 兜底
 */
const QUESTION_TYPE_TO_PROBES = {
  travel: ['weather_query', 'web_search'],
  finance: ['stock_query', 'exchange_rate'],
  career: ['web_search', 'company_info'],
  health: ['web_search'],
  relationship: [],
  life: [],
  city: ['web_search'],       // 租房/买房/定居：查信息但不查天气
  pet: ['web_search'],
  education: ['web_search'],
  legal: ['web_search'],
  competition: ['web_search'],
  tech: ['web_search'],
  other: [],
};

const REALTIME_PATTERN = /最新|现在|实时|今天|当前|近期|此刻/;
const STOCK_PATTERN = /股票|基金|A股|美股|港股|涨停|跌停|股价|行情/;
const STOCK_CODE_PATTERN = /(\d{6})/;
const STOCK_NAMES = ['贵州茅台', '茅台', '中国平安', '比亚迪', '宁德时代', '腾讯', '阿里', '阿里巴巴', '字节跳动'];

// travel 类型默认城市兜底（null 表示未识别，不硬编码特定城市）
const TRAVEL_DEFAULT_CITY = null;

// 常见目的地 → 城市映射（用于 weather_query 快速匹配，非硬编码依赖）
const DESTINATION_TO_CITY = {
  '西藏': '拉萨', '拉萨': '拉萨', '林芝': '林芝',
  '云南': '昆明', '昆明': '昆明', '大理': '大理', '丽江': '丽江', '香格里拉': '香格里拉',
  '北京': '北京', '上海': '上海', '成都': '成都', '深圳': '深圳', '广州': '广州',
  '杭州': '杭州', '西安': '西安', '青海': '西宁', '西宁': '西宁',
  '新疆': '乌鲁木齐', '海南': '海口', '三亚': '三亚', '厦门': '厦门',
  '日本': '东京', '欧洲': '巴黎', '泰国': '曼谷',
};

// 常见公司名（用于 company_info 抽取兜底）
const KNOWN_COMPANIES = ['腾讯', '阿里', '阿里巴巴', '字节跳动', '字节', '百度', '美团', '京东', '华为', '小米', '比亚迪', '宁德时代', '网易', '拼多多'];

// ============ 工具函数 ============

/**
 * 确定性映射：问题类型 + 关键词 → 工具清单
 * @param {string} question 用户问题
 * @param {string} questionType travel/finance/career/health/relationship/life
 * @returns {string[]} 工具名去重数组（仅含 mcpService 中真实存在的工具）
 */
export function detectToolNeeds(question, questionType) {
  const q = String(question || '');
  const probes = [...(QUESTION_TYPE_TO_PROBES[questionType] || [])];

  // 关键词兜底
  if (REALTIME_PATTERN.test(q) && !probes.includes('web_search')) probes.push('web_search');
  if (STOCK_PATTERN.test(q) && !probes.includes('stock_query')) probes.push('stock_query');

  // 去重 + 过滤掉 mcpService 中不存在的工具
  const valid = [...new Set(probes)].filter((n) => !!AGENT_TOOL_REGISTRY[n]);
  return valid;
}

/**
 * 为单个工具构造参数
 * @param {string} toolName 工具名
 * @param {string} question 用户问题
 * @param {string} questionType 问题类型
 * @returns {object} 工具参数
 */
export function buildProbeArgs(toolName, question, questionType) {
  const q = String(question || '');
  switch (toolName) {
    case 'weather_query':
      return { city: extractCity(q, questionType) };

    case 'web_search':
      return { query: buildSearchQuery(q, questionType), maxResults: 5 };

    case 'stock_query':
      return { symbol: extractStockSymbol(q) || 'sh600519' }; // 兜底茅台

    case 'exchange_rate': {
      if (/欧元|EUR|欧洲/i.test(q)) return { from: 'EUR', to: 'CNY' };
      if (/日元|JPY|日本/i.test(q)) return { from: 'JPY', to: 'CNY' };
      if (/英镑|GBP/i.test(q)) return { from: 'GBP', to: 'CNY' };
      if (/港币|HKD/i.test(q)) return { from: 'HKD', to: 'CNY' };
      return { from: 'USD', to: 'CNY' };
    }

    case 'company_info':
      return { name: extractCompanyName(q) || '腾讯' };

    case 'calendar_query':
      return {};

    case 'macro_data':
      return { indicator: 'GDP' };

    case 'salary_calc':
      return { base: 15000, city: '北京' };

    case 'translate_text':
      return { text: q.slice(0, 100) || '测试', targetLang: 'en' };

    case 'note_create':
      return { title: '推演记录', content: q.slice(0, 200) || '无内容' };

    default:
      return {};
  }
}

/**
 * 从问题中抽取城市名（weather_query 用）
 * @returns {string|null} 城市名，null 表示未识别
 */
function extractCity(question, questionType) {
  // travel 类型：优先抽"去XX"的 XX
  if (questionType === 'travel') {
    const m = question.match(/去([^\s，。、的进去玩旅]{2,4})/);
    if (m) {
      const dest = m[1];
      for (const key of Object.keys(DESTINATION_TO_CITY)) {
        if (dest.includes(key) || key.includes(dest)) {
          return DESTINATION_TO_CITY[key];
        }
      }
      // 抽到了但不在映射表，直接用抽取结果
      return dest;
    }
  }
  // 通用：扫描问题中是否包含已知目的地
  for (const key of Object.keys(DESTINATION_TO_CITY)) {
    if (question.includes(key)) return DESTINATION_TO_CITY[key];
  }
  // 未识别到城市，返回 null（不再硬编码拉萨）
  return TRAVEL_DEFAULT_CITY;
}

/**
 * 构造 web_search 查询词
 */
function buildSearchQuery(question, questionType) {
  const q = (question || '').slice(0, 60);
  switch (questionType) {
    case 'travel': {
      const m = q.match(/去([^\s，。、的进去玩旅]{2,4})/);
      const dest = m ? m[1] : '';
      // 有目的地搜"目的地 风险 政策 路况"，无目的地用问题本身
      return dest ? `${dest} 风险 政策 路况` : `${q.slice(0, 20)} 风险 注意事项`;
    }
    case 'health': {
      const m = q.match(/(生病|看病|运动|减肥|健身|养生|熬夜|失眠|焦虑|抑郁|体检|高原反应|感冒|发烧|胃痛|头疼)/);
      const kw = m ? m[1] : '健康';
      // 兜底 medical_query：搜"关键词 医学 注意事项"
      return `${kw} 医学 注意事项`;
    }
    case 'career': {
      const name = extractCompanyName(q);
      return name ? `${name} 公司 招聘 口碑` : '职业发展 建议';
    }
    case 'finance': {
      return `${q.slice(0, 20)} 财经 市场`;
    }
    default:
      return q || '综合';
  }
}

/**
 * 从问题中抽取股票代码或名称
 */
function extractStockSymbol(question) {
  const m = question.match(STOCK_CODE_PATTERN);
  if (m) return m[1];
  for (const name of STOCK_NAMES) {
    if (question.includes(name)) return name;
  }
  return null;
}

/**
 * 从问题中抽取公司名
 */
function extractCompanyName(question) {
  // "XX公司/集团/科技"
  const m1 = question.match(/([\u4e00-\u9fa5A-Za-z]{2,8})(?:公司|集团|科技|有限)/);
  if (m1) return m1[1];
  // "加入/入职/跳槽到 XX"
  const m2 = question.match(/(?:加入|进入|入职|跳槽到|应聘|去)([\u4e00-\u9fa5A-Za-z]{2,8})/);
  if (m2) return m2[1];
  // 常见公司名
  for (const name of KNOWN_COMPANIES) {
    if (question.includes(name)) return name;
  }
  return null;
}

// ============ 主入口 ============

/**
 * 演侧工具探测主入口
 * @param {string} question 用户问题
 * @param {string} questionType 问题类型
 * @returns {Promise<Array<{tool, args, result, summary, ok, elapsed?, error?}>>}
 *   失败的工具 ok:false，不抛错；总耗时硬限制 6s
 */
export async function probe(question, questionType, options = {}) {
  const executeGateway = options.executeGateway || executeEvidenceTool;
  const gatewayContext = options.context || {};
  const tools = detectToolNeeds(question, questionType);
  if (tools.length === 0) {
    logger.info('[ToolProbe] 无工具需求', {
      questionType,
      question: (question || '').slice(0, 40),
    });
    return [];
  }

  logger.info('[ToolProbe] 开始探测', {
    tools,
    questionType,
    question: (question || '').slice(0, 40),
  });
  const startTs = Date.now();

  // 共享已完成数组：每个工具完成即写入，便于总超时时返回已完成的
  const completed = [];
  const inflight = [];

  for (const toolName of tools) {
    const args = buildProbeArgs(toolName, question, questionType);
    // city=null 时跳过 weather_query（未识别到城市，不硬套默认城市）
    if (toolName === 'weather_query' && !args.city) {
      logger.info('[ToolProbe] weather_query 跳过（未识别到城市）', { question: (question || '').slice(0, 40) });
      continue;
    }
    const task = (async () => {
      const toolStart = Date.now();
      // HITL 危险工具拦截：医疗/法律类工具不直接执行，标记 needApproval 让演感知未被执行
      if (DANGEROUS_TOOLS.includes(toolName)) {
        const elapsed = Date.now() - toolStart;
        const summary = '此工具调用需要人工确认';
        logger.warn('[ToolProbe] 危险工具拦截（需人工确认）', { tool: toolName, args, elapsed });
        completed.push({
          tool: toolName,
          args,
          result: null,
          summary,
          ok: false,
          needApproval: true,
          elapsed,
        });
        return;
      }
      try {
        const gatewayResult = await executeGateway(toolName, args, gatewayContext);
        const elapsed = Date.now() - toolStart;
        const summary = gatewayResult.evidence?.summary
          || `天机未明（${toolName}:${gatewayResult.error?.code || gatewayResult.status}）`;
        const item = {
          tool: toolName,
          args,
          result: gatewayResult.evidence?.data || null,
          evidence: gatewayResult.evidence || null,
          status: gatewayResult.status,
          summary,
          ok: gatewayResult.ok === true && gatewayResult.evidence?.accepted === true,
          elapsed,
          ...(gatewayResult.error ? { error: gatewayResult.error.message, errorCode: gatewayResult.error.code } : {}),
        };
        logger[item.ok ? 'info' : 'warn']('[ToolProbe] 网关判定完成', {
          tool: toolName,
          elapsed,
          status: item.status,
          evidenceLevel: item.evidence?.level,
        });
        completed.push(item);
      } catch (e) {
        const elapsed = Date.now() - toolStart;
        const summary = `天机未明（${toolName}探测失败）`;
        logger.warn('[ToolProbe] 工具失败', { tool: toolName, elapsed, error: e.message });
        completed.push({ tool: toolName, args, result: null, summary, ok: false, elapsed, error: e.message });
      }
    })();
    inflight.push(task);
  }

  // 等待全部完成 或 总超时（6s 硬限制）
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(true), PROBE_TOTAL_TIMEOUT_MS);
  });
  const timeoutHit = await Promise.race([
    Promise.allSettled(inflight).then(() => false),
    timeoutPromise,
  ]);
  clearTimeout(timeoutId);

  const totalElapsed = Date.now() - startTs;

  // 对未完成的工具标注超时
  if (timeoutHit) {
    const completedTools = new Set(completed.map((r) => r.tool));
    for (const toolName of tools) {
      if (!completedTools.has(toolName)) {
        completed.push({
          tool: toolName,
          args: buildProbeArgs(toolName, question, questionType),
          result: null,
          summary: `天机未明（${toolName}探测超时）`,
          ok: false,
          error: 'total_timeout',
        });
      }
    }
    logger.warn('[ToolProbe] 总耗时超时，已标注未完成工具', {
      totalElapsed,
      toolCount: tools.length,
      completedBeforeTimeout: completed.length,
    });
  }

  const successCount = completed.filter((r) => r.ok).length;
  logger.info('[ToolProbe] 探测完成', {
    totalElapsed,
    toolCount: tools.length,
    successCount,
    failCount: completed.length - successCount,
    summaries: completed.map((r) => `${r.tool}:${r.ok ? '✓' : '✗'}`),
  });

  return completed;
}

// ============ 自检 ============

/**
 * 自检：
 *  1. detectToolNeeds('我要不要去西藏','travel') 应含 weather_query + web_search
 *  2. probe('我要不要去西藏','travel') 应返回数组（工具可能失败但不抛错）
 *
 * 跑法: cd server && node --input-type=module -e "import('./src/services/toolProbeService.js').then(m=>m.selfTest())"
 */
export async function selfTest() {
  logger.info('=== ToolProbeService selfTest 开始 ===');

  // 测试 1: detectToolNeeds - travel
  const needs1 = detectToolNeeds('我要不要去西藏', 'travel');
  const hasWeather = needs1.includes('weather_query');
  const hasSearch = needs1.includes('web_search');
  logger.info('[selfTest] 1. detectToolNeeds travel', {
    needs: needs1,
    hasWeather,
    hasSearch,
    pass: hasWeather && hasSearch,
  });

  // 测试 2: detectToolNeeds - 关键词兜底
  const needs2 = detectToolNeeds('今天最新的股票行情怎么样', 'finance');
  const hasStock = needs2.includes('stock_query');
  const hasSearch2 = needs2.includes('web_search');
  logger.info('[selfTest] 2. detectToolNeeds 关键词兜底', {
    needs: needs2,
    hasStock,
    hasSearch2,
    pass: hasStock && hasSearch2,
  });

  // 测试 3: detectToolNeeds - relationship（无工具）
  const needs3 = detectToolNeeds('我和女朋友吵架了', 'relationship');
  logger.info('[selfTest] 3. detectToolNeeds relationship（应为空）', { needs: needs3, pass: needs3.length === 0 });

  // 测试 4: buildProbeArgs
  const weatherArgs = buildProbeArgs('weather_query', '我要不要去西藏', 'travel');
  logger.info('[selfTest] 4. buildProbeArgs weather_query', { args: weatherArgs, pass: weatherArgs.city === '拉萨' });

  // 测试 5: probe 实跑（网络可能失败，但不抛错）
  logger.info('[selfTest] 5. probe 开始实跑（网络可能失败，验证降级）...');
  const results = await probe('我要不要去西藏', 'travel');
  const isArr = Array.isArray(results);
  const allWellFormed = results.every(
    (r) => typeof r.tool === 'string' && typeof r.summary === 'string' && typeof r.ok === 'boolean',
  );
  logger.info('[selfTest] 5. probe 结果', {
    count: results.length,
    isArr,
    allWellFormed,
    tools: results.map((r) => ({ tool: r.tool, ok: r.ok, summary: r.summary })),
  });

  const ok = hasWeather && hasSearch && isArr && allWellFormed;

  logger.info('=== ToolProbeService selfTest 结果 ===', {
    ok,
    needs1,
    probeCount: results.length,
    probeSuccessCount: results.filter((r) => r.ok).length,
  });

  if (!ok) {
    throw new Error(`selfTest 失败：ok=${ok}, needs1=${JSON.stringify(needs1)}, results=${JSON.stringify(results).slice(0, 300)}`);
  }

  return { ok, needs: needs1, probeResults: results };
}

export default {
  detectToolNeeds,
  buildProbeArgs,
  probe,
  selfTest,
};
