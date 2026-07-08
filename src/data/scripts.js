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
  },
  {
    id: 'exam',
    title: '考研 vs 就业',
    desc: '学术理想与现实就业的十字路口',
    unlocked: false,
    icon: '📚',
    dimensions: '成长 · 经济 · 时间',
    duration: '6-10 分钟',
  },
  {
    id: 'breakup',
    title: '要不要分手',
    desc: '感情投入与未来不确定性的拉锯',
    unlocked: false,
    icon: '❤️',
    dimensions: '情感 · 成长 · 自由',
    duration: '5-8 分钟',
  },
  {
    id: 'city',
    title: '要不要换城市',
    desc: '生活成本、机会密度、人际关系——权衡的极致考验',
    unlocked: false,
    icon: '🏠',
    dimensions: '经济 · 社交 · 发展',
    duration: '6-10 分钟',
  },
];
