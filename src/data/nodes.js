/**
 * Decision tree node definitions
 */

export const NODES = {
  /* ---- 0. 起始节点 ---- */
  root: {
    id: 'root',
    type: 'input',
    label: '推演开始',
    depth: 0,
    probability: 100,
    content: {
      title: '你的决策问题',
      desc: '输入你正在纠结的抉择，推演局将为你展开所有可能的走向。',
      placeholder: '例如：要不要接那个新 Offer？',
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'fog_salary', label: '薪资与回报', icon: '💰' },
      { targetId: 'fog_team', label: '团队与领导', icon: '👥' },
      { targetId: 'fog_growth', label: '成长空间', icon: '📈' },
    ],
    position: { x: 0.5, y: 0.05 },
  },

  /* ---- 1. 分支 A：薪资维度 ---- */
  fog_salary: {
    id: 'fog_salary',
    type: 'fog',
    label: '???',
    depth: 1,
    probability: 33,
    content: {
      title: '薪资与回报',
      desc: [
        '新 Offer：Base 28K/月（现 20K），涨幅 40%',
        '新公司无年终奖结构',
        '现公司年终约 3 个月工资，年收入约 30 万',
        '新公司年收入约 36.4 万',
        '真实薪资增幅：21.3%',
        '',
        '数字好看，但细算之后，增幅没有想象中夸张。',
      ],
    },
    hasAgents: true,
    hasDice: true,
    branches: [
      {
        targetId: 'crossroad_opt',
        label: '乐观信号：薪资空间值得押注',
        condition: 'dice_high',
        diceRange: [4, 6],
      },
      {
        targetId: 'crossroad_pess',
        label: '悲观信号：无年终是结构性风险',
        condition: 'dice_low',
        diceRange: [1, 3],
      },
    ],
    position: { x: 0.17, y: 0.25 },
  },

  /* ---- 2. 分支 B：团队维度 ---- */
  fog_team: {
    id: 'fog_team',
    type: 'fog',
    label: '???',
    depth: 1,
    probability: 33,
    content: {
      title: '团队与领导',
      desc: [
        '新团队编制 5 人，汇报给 3 个月前空降的技术总监',
        '团队处于组建期，文化尚未定型',
        '现团队 12 人，核心成员协作超过 2 年',
        '架构成熟、分工清晰，协作效率高',
        '',
        '小团队意味着更高的个人影响力，也意味着更大的磨合成本。',
      ],
    },
    hasAgents: true,
    hasDice: true,
    branches: [
      {
        targetId: 'crossroad_opt',
        label: '乐观信号：小团队高曝光高成长',
        condition: 'dice_high',
        diceRange: [4, 6],
      },
      {
        targetId: 'crossroad_pess',
        label: '悲观信号：空降总监是双刃剑',
        condition: 'dice_low',
        diceRange: [1, 3],
      },
    ],
    position: { x: 0.5, y: 0.25 },
  },

  /* ---- 3. 分支 C：成长维度 ---- */
  fog_growth: {
    id: 'fog_growth',
    type: 'fog',
    label: '???',
    depth: 1,
    probability: 34,
    content: {
      title: '成长空间',
      desc: [
        '新公司处于 AI / ML 赛道，B 轮融资阶段',
        '核心产品已获市场初步验证，技术栈涵盖大模型应用与数据工程',
        '现公司业务成熟但增长放缓，技术迭代速度明显下降',
        '个人成长天花板已隐约可见',
        '',
        '站在风口还是困在舒适区？这道题没有标准答案。',
      ],
    },
    hasAgents: true,
    hasDice: true,
    branches: [
      {
        targetId: 'crossroad_opt',
        label: '乐观信号：赛道红利期入场时机好',
        condition: 'dice_high',
        diceRange: [4, 6],
      },
      {
        targetId: 'crossroad_pess',
        label: '悲观信号：B 轮存活率不容乐观',
        condition: 'dice_low',
        diceRange: [1, 3],
      },
    ],
    position: { x: 0.83, y: 0.25 },
  },

  /* ---- 4. 骰子乐观分支 ---- */
  crossroad_opt: {
    id: 'crossroad_opt',
    type: 'fog',
    label: '???',
    depth: 2,
    probability: 50,
    content: {
      title: '天时地利',
      desc: [
        '综合三个维度来看：薪资锚点提升 21%、赛道处于上升期、',
        '小团队核心成员身份带来高成长潜力。',
        '',
        '骰子的命运说你现在站在一个不错的位置——',
        '尽管风险仍在，但上行的概率大于下行。',
        '',
        '现在需要做出最终选择。',
      ],
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'deep_accept', label: '接受 Offer', icon: '✅' },
      { targetId: 'deep_reject', label: '拒绝 Offer', icon: '❌' },
    ],
    position: { x: 0.35, y: 0.45 },
  },

  /* ---- 5. 骰子悲观分支 ---- */
  crossroad_pess: {
    id: 'crossroad_pess',
    type: 'fog',
    label: '???',
    depth: 2,
    probability: 50,
    content: {
      title: '暗流涌动',
      desc: [
        '综合三个维度来看：无年终的结构性风险、',
        '团队磨合期的不确定性、B 轮公司的存活压力。',
        '',
        '骰子的命运提醒你——那些你不愿意细想的风险，',
        '恰恰最需要被直面。',
        '',
        '现在需要做出最终选择。',
      ],
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'deep_accept', label: '接受 Offer', icon: '✅' },
      { targetId: 'deep_reject', label: '拒绝 Offer', icon: '❌' },
    ],
    position: { x: 0.65, y: 0.45 },
  },

  /* ---- 6. 接受的深层思考 ---- */
  deep_accept: {
    id: 'deep_accept',
    type: 'fog',
    label: '???',
    depth: 3,
    probability: 50,
    content: {
      title: '迈出这一步',
      desc: [
        '内心的声音越来越清晰：你想试试。',
        '',
        '也许会摔，也许会痛，',
        '但比起遗憾，你更害怕"本可以"。',
        '',
        '这个选择不需要被所有人理解，',
        '只需要被你自己接受。',
      ],
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'fate_accept', label: '揭晓命运', icon: '🎴' },
    ],
    position: { x: 0.35, y: 0.62 },
  },

  /* ---- 7. 拒绝的深层思考 ---- */
  deep_reject: {
    id: 'deep_reject',
    type: 'fog',
    label: '???',
    depth: 3,
    probability: 50,
    content: {
      title: '再等等看',
      desc: [
        '内心的声音告诉你：时机未到。',
        '',
        '不是放弃，而是等待更好的筹码。',
        '留在原地不代表停滞，而是积蓄力量。',
        '',
        '这个选择不需要被所有人认同，',
        '只需要你以后不再回头。',
      ],
    },
    hasAgents: true,
    hasDice: false,
    branches: [
      { targetId: 'fate_reject', label: '揭晓命运', icon: '🎴' },
    ],
    position: { x: 0.65, y: 0.62 },
  },

  /* ---- 8. 结局 A：接受 ---- */
  fate_accept: {
    id: 'fate_accept',
    type: 'fate',
    label: '命运卡',
    depth: 4,
    probability: 50,
    fateCardId: 'fate_accept',
    hasAgents: false,
    hasDice: false,
    branches: [],
    position: { x: 0.35, y: 0.8 },
  },

  /* ---- 9. 结局 B：拒绝 ---- */
  fate_reject: {
    id: 'fate_reject',
    type: 'fate',
    label: '命运卡',
    depth: 4,
    probability: 50,
    fateCardId: 'fate_reject',
    hasAgents: false,
    hasDice: false,
    branches: [],
    position: { x: 0.65, y: 0.8 },
  },
};

export const TOPOLOGY = {
  root: {
    children: ['fog_salary', 'fog_team', 'fog_growth'],
  },
  fog_salary: {
    children: ['crossroad_opt', 'crossroad_pess'],
  },
  fog_team: {
    children: ['crossroad_opt', 'crossroad_pess'],
  },
  fog_growth: {
    children: ['crossroad_opt', 'crossroad_pess'],
  },
  crossroad_opt: {
    children: ['deep_accept', 'deep_reject'],
  },
  crossroad_pess: {
    children: ['deep_accept', 'deep_reject'],
  },
  deep_accept: {
    children: ['fate_accept'],
  },
  deep_reject: {
    children: ['fate_reject'],
  },
  fate_accept: {
    children: [],
  },
  fate_reject: {
    children: [],
  },
};
