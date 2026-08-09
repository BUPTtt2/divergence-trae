/**
 * Scenario definitions for the scenario selection page
 */

export const SCENARIOS = [
  {
    id: 'offer',
    title: '要不要接新 Offer',
    desc: '薪资涨幅、团队变动、赛道红利——三重维度下的职业抉择推演',
    unlocked: true,
    icon: '💼',
    dimensions: '薪资 · 团队 · 成长',
    duration: '5-8 分钟',
    prompt: '我收到一个新 Offer，想比较薪资、团队、成长空间和离开的机会成本。',
  },
  {
    id: 'exam',
    title: '考研 vs 就业',
    desc: '学术理想与现实就业的十字路口',
    unlocked: true,
    icon: '📚',
    dimensions: '成长 · 经济 · 时间',
    duration: '6-10 分钟',
    prompt: '我在考研和直接就业之间犹豫，想比较时间成本、经济压力和长期成长。',
  },
  {
    id: 'breakup',
    title: '要不要分手',
    desc: '感情投入与未来不确定性的拉锯',
    unlocked: true,
    icon: '❤️',
    dimensions: '情感 · 成长 · 自由',
    duration: '5-8 分钟',
    prompt: '我在考虑要不要结束一段关系，想梳理真实感受、边界和未来期待。',
  },
  {
    id: 'city',
    title: '要不要换城市',
    desc: '生活成本、机会密度、人际关系——权衡的极致考验',
    unlocked: true,
    icon: '🏠',
    dimensions: '经济 · 社交 · 发展',
    duration: '6-10 分钟',
    prompt: '我在考虑要不要换城市，想比较生活成本、工作机会、人际支持和可逆性。',
  },
];
