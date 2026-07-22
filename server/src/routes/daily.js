import { Router } from 'express';
import { castHexagram } from '../services/yiJingEngine.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// 八卦基础信息（用于每日运势）
const TRIGRAMS = [
  { name: '乾', trigram: '☰', element: '金', desc: '天行健，君子以自强不息', fortune: '今日宜进取', advice: '顺势而为，勇往直前' },
  { name: '坤', trigram: '☷', element: '土', desc: '地势坤，君子以厚德载物', fortune: '今日宜守成', advice: '积蓄力量，厚积薄发' },
  { name: '震', trigram: '☳', element: '木', desc: '洊雷，君子以恐惧修省', fortune: '今日宜警醒', advice: '保持警觉，防患未然' },
  { name: '巽', trigram: '☴', element: '木', desc: '随风，君子以申命行事', fortune: '今日宜沟通', advice: '顺势而为，善于变通' },
  { name: '坎', trigram: '☵', element: '水', desc: '习坎，有孚，维心亨', fortune: '今日宜审慎', advice: '步步为营，稳中求进' },
  { name: '离', trigram: '☲', element: '火', desc: '明两作，大人以继明照于四方', fortune: '今日宜开拓', advice: '光明磊落，照耀前程' },
  { name: '艮', trigram: '☶', element: '土', desc: '艮其背，不获其身', fortune: '今日宜静思', advice: '知止不殆，静守本心' },
  { name: '兑', trigram: '☱', element: '金', desc: '丽泽，君子以朋友讲习', fortune: '今日宜社交', advice: '广结善缘，和而不同' },
];

const FORTUNE_ADVICE = [
  { category: '事业', items: ['适合推进新项目', '注意团队协作', '可能遇到机遇', '保持专注'] },
  { category: '财运', items: ['稳健理财', '不宜大额投资', '可能有意外收入', '谨慎借贷'] },
  { category: '感情', items: ['增进沟通', '保持耐心', '适合表达心意', '注意边界'] },
  { category: '健康', items: ['适当运动', '注意休息', '饮食规律', '保持心态'] },
];

const LUCKY_COLORS = [
  { color: '#C8A850', name: '金色' },
  { color: '#508870', name: '绿色' },
  { color: '#5078A8', name: '蓝色' },
  { color: '#C86848', name: '红色' },
  { color: '#A88860', name: '棕色' },
];

/**
 * 根据日期生成确定性的每日数据（同一天结果一致）
 */
function getDailyData(dateStr) {
  const date = new Date(dateStr);
  const seed = date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const trigramIdx = seed % TRIGRAMS.length;
  const trigram = TRIGRAMS[trigramIdx];

  const luckyNum = (seed * 7 + 3) % 99 + 1;
  const luckyColor = LUCKY_COLORS[seed % LUCKY_COLORS.length];

  const advice = FORTUNE_ADVICE.map((cat) => ({
    ...cat,
    item: cat.items[seed % cat.items.length],
  }));

  return {
    date: date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }),
    dateStr,
    trigram,
    luckyNum,
    luckyColor,
    advice,
  };
}

/**
 * GET /api/daily?date=YYYY-MM-DD
 * 返回当日卦象和运势
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const dateStr = req.query.date || today;

    // 验证日期格式
    const parsed = new Date(dateStr);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: '日期格式无效，请使用 YYYY-MM-DD' });
    }

    const dailyData = getDailyData(dateStr);

    // 用日期作为种子起卦（确定性，同一天同结果）
    const dateSeed = parsed.getFullYear() * 10000 + (parsed.getMonth() + 1) * 100 + parsed.getDate();
    // 模拟金钱卦：用种子生成确定的六爻
    const lines = [];
    for (let i = 0; i < 6; i++) {
      const val = (dateSeed + i * 31) % 4;
      // 0=6老阴 1=7少阳 2=8少阴 3=9老阳
      const lineVal = [6, 7, 8, 9][val];
      lines.push({
        value: lineVal,
        isYang: lineVal === 7 || lineVal === 9,
        isChanging: lineVal === 6 || lineVal === 9,
      });
    }

    // 获取卦象
    const { getHexagram } = await import('../services/yiJingEngine.js');
    const originalLines = lines.map((l) => l.isYang);
    const changedLines = lines.map((l) => (l.isChanging ? !l.isYang : l.isYang));
    const original = getHexagram(originalLines);
    const changed = getHexagram(changedLines);

    res.json({
      ...dailyData,
      hexagram: {
        original,
        changed,
        lines,
      },
    });
  })
);

export default router;
