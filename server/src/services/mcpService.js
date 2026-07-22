const MOCK_TOOLS = [
  {
    name: 'weather_query',
    description: '查询指定城市的实时天气信息',
    category: '生活',
    icon: '☀️',
    parameters: {
      city: { type: 'string', description: '城市名称，如：北京、上海、深圳', required: true },
    },
  },
  {
    name: 'calendar_query',
    description: '查询指定日期的日历、黄历信息',
    category: '工具',
    icon: '📅',
    parameters: {
      date: { type: 'string', description: '日期，格式：YYYY-MM-DD，默认为今天', required: false },
    },
  },
  {
    name: 'note_create',
    description: '创建一条笔记记录',
    category: '效率',
    icon: '📝',
    parameters: {
      title: { type: 'string', description: '笔记标题', required: true },
      content: { type: 'string', description: '笔记内容', required: true },
      tags: { type: 'array', description: '标签列表', required: false },
    },
  },
  {
    name: 'web_search',
    description: '在互联网上搜索相关信息',
    category: '搜索',
    icon: '🔍',
    parameters: {
      query: { type: 'string', description: '搜索关键词', required: true },
      maxResults: { type: 'number', description: '返回结果数量，默认5', required: false },
    },
  },
  {
    name: 'translate_text',
    description: '翻译文本到指定语言',
    category: '工具',
    icon: '🌐',
    parameters: {
      text: { type: 'string', description: '待翻译文本', required: true },
      targetLang: { type: 'string', description: '目标语言，如：en、zh、ja', required: false },
    },
  },
  {
    name: 'stock_query',
    description: '查询股票或基金的实时行情',
    category: '金融',
    icon: '📈',
    parameters: {
      symbol: { type: 'string', description: '股票代码或基金代码', required: true },
    },
  },
];

const TOOL_MAP = {};
for (const tool of MOCK_TOOLS) {
  TOOL_MAP[tool.name] = tool;
}

export function listTools() {
  return MOCK_TOOLS.map(t => ({
    name: t.name,
    description: t.description,
    category: t.category,
    icon: t.icon,
    parameters: t.parameters,
  }));
}

export async function callTool(toolName, params = {}) {
  const tool = TOOL_MAP[toolName];
  if (!tool) {
    throw new Error(`工具不存在: ${toolName}`);
  }

  for (const [key, def] of Object.entries(tool.parameters)) {
    if (def.required && (params[key] === undefined || params[key] === null)) {
      throw new Error(`缺少必填参数: ${key}`);
    }
  }

  const result = await mockToolExecution(toolName, params);
  return {
    tool: toolName,
    params,
    result,
    timestamp: new Date().toISOString(),
  };
}

async function mockToolExecution(toolName, params) {
  await new Promise(resolve => setTimeout(resolve, 100));

  switch (toolName) {
    case 'weather_query':
      return {
        city: params.city,
        temperature: 26,
        condition: '多云转晴',
        humidity: 65,
        wind: '东南风 3级',
        forecast: [
          { day: '今天', high: 28, low: 22, condition: '多云' },
          { day: '明天', high: 30, low: 23, condition: '晴' },
          { day: '后天', high: 27, low: 21, condition: '小雨' },
        ],
        advice: '今日气温适宜，适合外出活动。',
      };

    case 'calendar_query': {
      const date = params.date || new Date().toISOString().split('T')[0];
      return {
        date,
        lunar: '六月初九',
        ganzhi: '丙午年 乙未月 壬辰日',
        yi: ['祭祀', '出行', '交友'],
        ji: ['动土', '开张', '嫁娶'],
        festival: null,
        weekday: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(date).getDay()],
      };
    }

    case 'note_create':
      return {
        id: 'note_' + Date.now(),
        title: params.title,
        content: params.content,
        tags: params.tags || [],
        createdAt: new Date().toISOString(),
        status: 'saved',
      };

    case 'web_search':
      return {
        query: params.query,
        totalResults: 42,
        results: [
          {
            title: `${params.query} - 百度百科`,
            snippet: `${params.query}是一个广受关注的话题。本文将从多个角度深入分析${params.query}的历史背景、现状和未来发展趋势...`,
            url: `https://baike.baidu.com/item/${encodeURIComponent(params.query)}`,
            source: '百度百科',
          },
          {
            title: `关于${params.query}的最新研究进展`,
            snippet: `近期研究表明，${params.query}在多个领域都有重要应用。专家认为，未来几年内${params.query}将迎来重大突破...`,
            url: `https://example.com/research/${encodeURIComponent(params.query)}`,
            source: '学术前沿',
          },
          {
            title: `${params.query}完全指南 - 新手入门到精通`,
            snippet: `本指南将带你从零开始学习${params.query}，包括基础概念、核心原理、实战案例等内容...`,
            url: `https://example.com/guide/${encodeURIComponent(params.query)}`,
            source: '技术专栏',
          },
        ],
      };

    case 'translate_text':
      return {
        original: params.text,
        translated: `[${params.targetLang || 'en'}翻译] ${params.text}`,
        targetLang: params.targetLang || 'en',
        sourceLang: 'zh',
        confidence: 0.92,
      };

    case 'stock_query':
      return {
        symbol: params.symbol,
        name: `${params.symbol}`,
        price: 42.68,
        change: 1.25,
        changePercent: 3.02,
        high: 43.20,
        low: 41.50,
        open: 41.80,
        prevClose: 41.43,
        volume: '1.2亿',
        marketCap: '856亿',
        updateTime: new Date().toISOString(),
      };

    default:
      return { message: '工具调用成功（占位实现）', params };
  }
}

export default {
  listTools,
  callTool,
};
