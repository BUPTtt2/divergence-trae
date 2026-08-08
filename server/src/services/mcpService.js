/**
 * MCP 工具服务 — 真实实现 + 工具注册表
 *
 * 设计依据：docs/TOOL_CALLING_DESIGN.md（方案 A 主路径）
 *
 * 工具清单（10 个）：
 *   真实实现（免费无 key）：
 *   - web_search:    DuckDuckGo HTML 解析
 *   - stock_query:   新浪财经实时行情
 *   - weather_query: wttr.in
 *   - exchange_rate: open.er-api.com
 *   - company_info:  DuckDuckGo 搜索降级
 *   - macro_data:    预设宏观数据集（无网络）
 *   - salary_calc:   本地薪资计算器（无网络）
 *   - calendar_query: 本地黄历数据（无网络）
 *   mock（需 API key 或本地功能，暂保留）：
 *   - translate_text / note_create
 *
 * 所有真实工具统一 5s 超时；失败抛错由调用方降级。
 */

const DEFAULT_TIMEOUT = 5000;

// ===== 预设数据（本地，无网络）=====

// 黄历预设数据（可扩展，缺失日期走默认）
const CALENDAR_DATA = {
  '2026-07-28': { lunar: '六月十五', ganzhi: '丙午年 乙未月 壬辰日', yi: ['祭祀', '出行', '交友'], ji: ['动土', '开张', '嫁娶'] },
  '2026-07-29': { lunar: '六月十六', ganzhi: '丙午年 乙未月 癸巳日', yi: ['祈福', '求嗣', '开光'], ji: ['安葬', '破土'] },
  '2026-07-30': { lunar: '六月十七', ganzhi: '丙午年 乙未月 甲午日', yi: ['嫁娶', '纳采'], ji: ['出行', '动土'] },
};

// 宏观数据预设（国家统计局公开数据快照，定期更新）
const MACRO_DATA = {
  GDP: { value: '126.06万亿元', growth: '5.2%', period: '2024年全年', source: '国家统计局' },
  CPI: { value: '同比+0.2%', period: '2024年12月', source: '国家统计局' },
  LPR: { '1年期': '3.0%', '5年期以上': '3.5%', period: '2025年', source: '中国人民银行' },
  PMI: { value: '50.1%', trend: '荣枯线以上', period: '2024年12月', source: '国家统计局' },
};

// ===== 通用工具 =====

function withTimeout(promise, ms = DEFAULT_TIMEOUT) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`工具执行超时(${ms}ms)`)), ms)),
  ]);
}

async function fetchTool(url, opts = {}, ms = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ===== 工具实现 =====

/**
 * web_search — 百度搜索建议（国内首选）+ DuckDuckGo（国际备选）
 */
async function webSearch({ query, maxResults = 3 }) {
  // 1. 优先用百度搜索建议 API（国内网络稳定）
  try {
    const baiduUrl = `https://www.baidu.com/sugrec?prod=pc&wd=${encodeURIComponent(query)}`;
    const baiduResp = await fetchTool(baiduUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    if (baiduResp.ok) {
      const baiduData = await baiduResp.json();
      const sugList = Array.isArray(baiduData.g) ? baiduData.g : [];
      const results = sugList.slice(0, maxResults).map(item => ({
        title: item.q || '',
        snippet: '百度搜索建议',
        url: `https://www.baidu.com/s?wd=${encodeURIComponent(item.q || '')}`,
      }));
      if (results.length > 0) {
        return { query, totalResults: results.length, results, fallback: false, source: '百度搜索建议' };
      }
    }
  } catch (e) {
    // 百度失败，继续尝试 DuckDuckGo
  }

  // 2. 备选：DuckDuckGo HTML 解析
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const resp = await fetchTool(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`搜索 HTTP ${resp.status}`);
  const html = await resp.text();
  const results = [];
  // DuckDuckGo HTML 结构：result__a (标题链接) + result__snippet
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < maxResults) {
    let href = m[1];
    // DuckDuckGo 重定向：//duckduckgo.com/l/?uddg=<encoded>
    const u = href.match(/uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    const snippet = m[3].replace(/<[^>]+>/g, '').trim().slice(0, 200);
    if (title) results.push({ title, snippet, url: href });
  }
  return {
    query, totalResults: results.length, results,
    fallback: results.length === 0,
    source: 'DuckDuckGo',
  };
}

/**
 * stock_query — 新浪财经实时行情（A 股）
 */
async function stockQuery({ symbol }) {
  let code = String(symbol || '').trim();
  // 支持中文名称 → 代码（常见股票）
  const nameMap = { '贵州茅台': 'sh600519', '茅台': 'sh600519', '中国平安': 'sh601318', '比亚迪': 'sz002594', '宁德时代': 'sz300750' };
  if (nameMap[code]) code = nameMap[code];
  // 6 位数字 → 自动加前缀
  if (/^\d{6}$/.test(code)) {
    code = (code.startsWith('6') || code.startsWith('9')) ? `sh${code}` : `sz${code}`;
  }
  if (!/^s[hz]\d{6}$/.test(code)) {
    return { error: '仅支持 A 股代码（6 位数字或 sh/sz 前缀），港股/美股暂不支持', symbol };
  }
  const url = `https://hq.sinajs.cn/list=${code}`;
  const resp = await fetchTool(url, {
    headers: {
      Referer: 'https://finance.sina.com.cn',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });
  if (!resp.ok) throw new Error(`新浪财经 HTTP ${resp.status}`);
  const text = await resp.text();
  const match = text.match(/hq_str_\w+="([^"]*)"/);
  if (!match || !match[1]) return { error: '行情数据为空，可能非交易时间或代码无效', symbol };
  const f = match[1].split(',');
  // A 股字段：0名称 1今开 2昨收 3最新 4高 5低 6买1 7卖1 8成交量(手) 9成交额
  const name = f[0];
  const prevClose = parseFloat(f[2]);
  const price = parseFloat(f[3]);
  const high = parseFloat(f[4]);
  const low = parseFloat(f[5]);
  const volume = parseFloat(f[8]);
  const amount = parseFloat(f[9]);
  if (!name || !price) return { error: '行情数据解析失败', symbol };
  const change = +(price - prevClose).toFixed(2);
  const changePercent = prevClose ? +((change / prevClose) * 100).toFixed(2) : 0;
  return {
    symbol: code, name, price, prevClose, change, changePercent,
    high, low, volume, amount,
    date: f[30], time: f[31],
    source: '新浪财经',
  };
}

/**
 * weather_query — wttr.in（带 1 次重试，应对国内网络波动）
 */
async function weatherQuery({ city }) {
  const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) curl/7.84.0' };

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetchTool(url, { headers }, 6000);
      if (!resp.ok) throw new Error(`wttr.in HTTP ${resp.status}`);
      const data = await resp.json();
      const cur = data.current_condition?.[0] || {};
      return {
        city,
        temperature: `${cur.temp_C}°C`,
        feelsLike: `${cur.FeelsLikeC}°C`,
        condition: cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || '',
        humidity: `${cur.humidity}%`,
        wind: `${cur.windspeedKmph}km/h ${cur.winddir16Point}`,
        forecast: (data.weather || []).slice(0, 3).map(w => ({
          date: w.date,
          high: `${w.maxtempC}°C`,
          low: `${w.mintempC}°C`,
          avg: `${w.avgtempC}°C`,
          condition: w.hourly?.[4]?.lang_zh?.[0]?.value || w.hourly?.[4]?.weatherDesc?.[0]?.value || '',
        })),
        source: 'wttr.in',
      };
    } catch (e) {
      lastError = e;
      // 第 1 次失败后等 1s 再重试
      if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

/**
 * calendar_query — 本地黄历数据
 */
function calendarQuery({ date } = {}) {
  const d = date || new Date().toISOString().split('T')[0];
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d + 'T00:00:00').getDay()];
  const preset = CALENDAR_DATA[d] || {
    lunar: '需查农历',
    ganzhi: '丙午年',
    yi: ['祭祀', '出行'],
    ji: ['动土', '开张'],
  };
  return {
    date: d, weekday: wd,
    lunar: preset.lunar, ganzhi: preset.ganzhi,
    yi: preset.yi, ji: preset.ji,
    festival: null,
    source: '本地黄历',
  };
}

/**
 * note_create — mock（本地笔记功能）
 */
function noteCreate({ title, content, tags = [] }) {
  return {
    id: `note_${Date.now()}`,
    title, content, tags,
    createdAt: new Date().toISOString(),
    status: 'saved',
    mock: true,
  };
}

/**
 * translate_text — mock（需 API key，暂保留）
 */
function translateText({ text, targetLang = 'en' }) {
  return {
    original: text,
    translated: `[${targetLang} mock] ${text}`,
    targetLang,
    sourceLang: 'zh',
    confidence: 0.5,
    mock: true,
    note: '翻译工具为 mock 实现，未接入真实翻译 API',
  };
}

/**
 * exchange_rate — open.er-api.com（免费无 key）
 */
async function exchangeRate({ from = 'USD', to = 'CNY' }) {
  const f = String(from).toUpperCase();
  const t = String(to).toUpperCase();
  const url = `https://open.er-api.com/v6/latest/${f}`;
  const resp = await fetchTool(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`exchangerate HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.result !== 'success') throw new Error(`exchangerate: ${data['error-type'] || 'unknown'}`);
  const rate = data.rates?.[t];
  if (!rate) return { error: `未找到 ${f} → ${t} 汇率`, from: f, to: t };
  return {
    from: f, to: t,
    rate: +rate.toFixed(4),
    updateTime: data.time_last_update_utc,
    nextUpdate: data.time_next_update_utc,
    source: 'open.er-api.com',
  };
}

/**
 * salary_calc — 本地薪资计算器（简化个税 + 五险一金）
 */
function salaryCalc({ base, bonus = 0, city = '北京' }) {
  const monthlyBase = Math.max(0, Number(base) || 0);
  const monthlyBonus = Math.max(0, Number(bonus) || 0);
  const gross = monthlyBase + monthlyBonus;
  // 各城市简化五险一金个人缴纳比例（养老8% + 医疗2% + 失业0.5% + 公积金）
  const rates = {
    '北京': { pension: 0.08, medical: 0.02, unemployment: 0.005, housing: 0.12, total: 0.225 },
    '上海': { pension: 0.08, medical: 0.02, unemployment: 0.005, housing: 0.07, total: 0.175 },
    '深圳': { pension: 0.08, medical: 0.02, unemployment: 0.003, housing: 0.05, total: 0.153 },
    '广州': { pension: 0.08, medical: 0.02, unemployment: 0.002, housing: 0.05, total: 0.152 },
    '杭州': { pension: 0.08, medical: 0.02, unemployment: 0.005, housing: 0.12, total: 0.225 },
    '成都': { pension: 0.08, medical: 0.02, unemployment: 0.004, housing: 0.06, total: 0.164 },
  };
  const r = rates[city] || rates['北京'];
  const insurance = Math.round(monthlyBase * r.total);
  const breakdown = {
    pension: Math.round(monthlyBase * r.pension),
    medical: Math.round(monthlyBase * r.medical),
    unemployment: Math.round(monthlyBase * r.unemployment),
    housing: Math.round(monthlyBase * r.housing),
  };
  // 个税（月度简化，起征点 5000，累进速算）
  const taxable = Math.max(0, monthlyBase - insurance - 5000);
  let tax = 0;
  if (taxable <= 0) tax = 0;
  else if (taxable <= 3000) tax = taxable * 0.03;
  else if (taxable <= 12000) tax = taxable * 0.1 - 210;
  else if (taxable <= 25000) tax = taxable * 0.2 - 1410;
  else if (taxable <= 35000) tax = taxable * 0.25 - 2660;
  else if (taxable <= 55000) tax = taxable * 0.3 - 4410;
  else if (taxable <= 80000) tax = taxable * 0.35 - 7160;
  else tax = taxable * 0.45 - 15160;
  tax = Math.max(0, Math.round(tax));
  const net = gross - insurance - tax;
  const annualNet = net * 12;
  return {
    city, base: monthlyBase, bonus: monthlyBonus, gross,
    insurance, insuranceBreakdown: breakdown,
    tax, taxableIncome: taxable,
    netIncome: net, annualNet,
    actualTaxRate: gross > 0 ? `${Math.round((1 - net / gross) * 1000) / 10}%` : '0%',
    source: '本地简化计算（2024 税率）',
  };
}

/**
 * company_info — DuckDuckGo 搜索降级
 */
async function companyInfo({ name }) {
  try {
    const results = await webSearch({ query: `${name} 公司 工商信息 融资 行业`, maxResults: 3 });
    return {
      name,
      note: '基于公开搜索的简略信息（无天眼查/企查查 API key）',
      results: results.results,
      source: 'DuckDuckGo 搜索',
    };
  } catch (e) {
    return { name, error: e.message, results: [], source: 'DuckDuckGo 搜索（失败）' };
  }
}

/**
 * macro_data — 预设宏观数据
 */
function macroData({ indicator = 'GDP' }) {
  const key = String(indicator).toUpperCase();
  const data = MACRO_DATA[key];
  if (!data) {
    return {
      error: `未支持的指标: ${indicator}`,
      supported: ['GDP', 'CPI', 'LPR', 'PMI'],
    };
  }
  return { indicator: key, ...data };
}

// ===== 工具注册表 =====

export const TOOL_REGISTRY = {
  web_search: {
    name: 'web_search',
    description: '在互联网上搜索相关信息。返回前 3 条结果的标题、摘要、链接。适用于查新闻、查公司、查概念。',
    category: '搜索',
    icon: '🔍',
    timeout: 5000,
    executionMode: 'live', riskLevel: 'R1', evidenceLevel: 'E2', evidenceKind: 'web', agentAccessible: true,
    execute: webSearch,
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      maxResults: { type: 'number', description: '返回结果数，默认3', required: false },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '返回结果数，默认3' },
      },
      required: ['query'],
    },
  },
  stock_query: {
    name: 'stock_query',
    description: '查询 A 股股票实时行情。输入 6 位股票代码或股票名（如 600519、贵州茅台）。返回最新价、涨跌幅、成交量等。',
    category: '金融',
    icon: '📈',
    timeout: 5000,
    executionMode: 'live', riskLevel: 'R1', evidenceLevel: 'E2', evidenceKind: 'market', agentAccessible: true,
    execute: stockQuery,
    parameters: {
      symbol: { type: 'string', description: '股票代码或名称（如 600519、贵州茅台）', required: true },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: '股票代码或名称（如 600519、贵州茅台）' },
      },
      required: ['symbol'],
    },
  },
  weather_query: {
    name: 'weather_query',
    description: '查询指定城市实时天气。返回当前温度、天气状况、湿度、风力及未来 3 天预报。',
    category: '生活',
    icon: '☀️',
    timeout: 5000,
    executionMode: 'live', riskLevel: 'R1', evidenceLevel: 'E2', evidenceKind: 'weather', agentAccessible: true,
    execute: weatherQuery,
    parameters: {
      city: { type: 'string', description: '城市名称，如：北京、上海', required: true },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称，如：北京、上海' },
      },
      required: ['city'],
    },
  },
  calendar_query: {
    name: 'calendar_query',
    description: '查询指定日期的日历、黄历信息（农历、干支、宜忌）。',
    category: '工具',
    icon: '📅',
    timeout: 2000,
    executionMode: 'static', riskLevel: 'R0', evidenceLevel: 'E0', evidenceKind: 'interpretive', agentAccessible: true,
    execute: calendarQuery,
    parameters: {
      date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天', required: false },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: '日期 YYYY-MM-DD，默认今天' },
      },
    },
  },
  note_create: {
    name: 'note_create',
    description: '创建一条笔记记录（本地存储，mock 实现）。',
    category: '效率',
    icon: '📝',
    timeout: 1000,
    executionMode: 'mock', riskLevel: 'R3', evidenceLevel: 'E0', evidenceKind: 'write', agentAccessible: false,
    execute: noteCreate,
    parameters: {
      title: { type: 'string', description: '笔记标题', required: true },
      content: { type: 'string', description: '笔记内容', required: true },
      tags: { type: 'array', description: '标签列表', required: false },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '笔记标题' },
        content: { type: 'string', description: '笔记内容' },
        tags: { type: 'array', items: { type: 'string' }, description: '标签列表' },
      },
      required: ['title', 'content'],
    },
  },
  translate_text: {
    name: 'translate_text',
    description: '翻译文本到指定语言（mock 实现，未接入真实 API）。',
    category: '工具',
    icon: '🌐',
    timeout: 1000,
    executionMode: 'mock', riskLevel: 'R1', evidenceLevel: 'E0', evidenceKind: 'translation', agentAccessible: false,
    execute: translateText,
    parameters: {
      text: { type: 'string', description: '待翻译文本', required: true },
      targetLang: { type: 'string', description: '目标语言，如 en/zh/ja', required: false },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待翻译文本' },
        targetLang: { type: 'string', description: '目标语言，如 en/zh/ja' },
      },
      required: ['text'],
    },
  },
  exchange_rate: {
    name: 'exchange_rate',
    description: '查询实时汇率。输入源币种和目标币种代码（如 USD、CNY、EUR）。返回当前汇率。',
    category: '金融',
    icon: '💱',
    timeout: 5000,
    executionMode: 'live', riskLevel: 'R1', evidenceLevel: 'E2', evidenceKind: 'market', agentAccessible: true,
    execute: exchangeRate,
    parameters: {
      from: { type: 'string', description: '源币种代码，如 USD', required: true },
      to: { type: 'string', description: '目标币种代码，如 CNY', required: true },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: '源币种代码，如 USD' },
        to: { type: 'string', description: '目标币种代码，如 CNY' },
      },
      required: ['from', 'to'],
    },
  },
  salary_calc: {
    name: 'salary_calc',
    description: '薪资计算器：输入月薪基数、奖金、城市，计算税后收入、五险一金、个税。仅支持中国大陆主要城市。',
    category: '金融',
    icon: '💰',
    timeout: 1000,
    executionMode: 'deterministic', riskLevel: 'R0', evidenceLevel: 'E0', evidenceKind: 'calculation', agentAccessible: true,
    execute: salaryCalc,
    parameters: {
      base: { type: 'number', description: '月薪基数（元）', required: true },
      bonus: { type: 'number', description: '月奖金（元，默认0）', required: false },
      city: { type: 'string', description: '城市（如 北京/上海/深圳）', required: false },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        base: { type: 'number', description: '月薪基数（元）' },
        bonus: { type: 'number', description: '月奖金（元，默认0）' },
        city: { type: 'string', description: '城市（北京/上海/深圳/广州/杭州/成都）' },
      },
      required: ['base'],
    },
  },
  company_info: {
    name: 'company_info',
    description: '查询公司基本信息。输入公司名称，返回搜索到的工商/融资/行业信息摘要。基于公开搜索降级实现。',
    category: '工具',
    icon: '🏢',
    timeout: 5000,
    executionMode: 'live', riskLevel: 'R1', evidenceLevel: 'E2', evidenceKind: 'web', agentAccessible: true,
    execute: companyInfo,
    parameters: {
      name: { type: 'string', description: '公司名称', required: true },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '公司名称' },
      },
      required: ['name'],
    },
  },
  macro_data: {
    name: 'macro_data',
    description: '查询宏观经济指标。支持 GDP/CPI/LPR/PMI。返回最新数值与来源。',
    category: '金融',
    icon: '📊',
    timeout: 1000,
    executionMode: 'static', riskLevel: 'R0', evidenceLevel: 'E0', evidenceKind: 'snapshot', agentAccessible: true,
    execute: macroData,
    parameters: {
      indicator: { type: 'string', description: '指标：GDP/CPI/LPR/PMI', required: true },
    },
    parametersSchema: {
      type: 'object',
      properties: {
        indicator: { type: 'string', enum: ['GDP', 'CPI', 'LPR', 'PMI'], description: '宏观指标' },
      },
      required: ['indicator'],
    },
  },
};

/**
 * 执行工具（带超时 + 必填校验）
 * @param {string} name 工具名
 * @param {object} params 参数
 * @returns {Promise<any>} 工具结果
 */
export async function executeTool(name, params = {}) {
  const tool = TOOL_REGISTRY[name];
  if (!tool) throw new Error(`工具不存在: ${name}`);
  for (const [key, def] of Object.entries(tool.parameters)) {
    if (def.required && (params[key] === undefined || params[key] === null)) {
      throw new Error(`缺少必填参数: ${key}`);
    }
  }
  return withTimeout(tool.execute(params || {}), tool.timeout || DEFAULT_TIMEOUT);
}

/**
 * 获取工具的 LLM function calling schema 数组
 * @param {string[]} names 工具名列表
 * @returns {Array} OpenAI tools 格式
 */
export function getToolSchemas(names = []) {
  return names
    .map(n => TOOL_REGISTRY[n])
    .filter(t => t?.agentAccessible !== false)
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parametersSchema,
      },
    }));
}

/**
 * 生成工具结果摘要（用于 SSE event:tool_result 推送）
 */
export function summarizeToolResult(name, result) {
  if (!result || result.error) return `❌ ${result?.error || '调用失败'}`;
  switch (name) {
    case 'stock_query':
      return result.name
        ? `📊 ${result.name} ${result.price}元 ${result.changePercent >= 0 ? '+' : ''}${result.changePercent}% (${result.source})`
        : '📊 行情查询失败';
    case 'web_search':
      return `🔍 找到 ${result.results?.length || 0} 条结果`;
    case 'weather_query':
      return `☀️ ${result.city} ${result.temperature} ${result.condition}`;
    case 'exchange_rate':
      return `💱 ${result.from}→${result.to} ${result.rate}`;
    case 'salary_calc':
      return `💰 税后 ${result.netIncome}元/月 (综合税率 ${result.actualTaxRate})`;
    case 'macro_data':
      return `📊 ${result.indicator}: ${result.value || JSON.stringify(result)}`;
    case 'company_info':
      return `🏢 查到 ${result.results?.length || 0} 条相关信息`;
    case 'calendar_query':
      return `📅 ${result.date} ${result.lunar} 宜${(result.yi || []).join('/')}`;
    case 'translate_text':
      return `🌐 ${result.translated}`;
    case 'note_create':
      return `📝 笔记已保存: ${result.title}`;
    default:
      return `${name} 调用完成`;
  }
}

// ===== 向后兼容（/api/mcp/* 路由用）=====

export function listTools() {
  return Object.values(TOOL_REGISTRY).filter(t => t.agentAccessible !== false).map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    icon: t.icon,
    parameters: t.parameters,
    executionMode: t.executionMode,
    riskLevel: t.riskLevel,
  }));
}

export async function callTool(toolName, params = {}) {
  const { executeEvidenceTool } = await import('./toolEvidenceGateway.js');
  return executeEvidenceTool(toolName, params);
}

export default {
  listTools,
  callTool,
  executeTool,
  getToolSchemas,
  summarizeToolResult,
  TOOL_REGISTRY,
};
