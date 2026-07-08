// 中国风水墨配色 - 宣纸白底 + 传统色彩点缀

export const COLORS = {
  // 背景 - 水墨宣纸
  bgTop:    '#FAF8F0',  // 宣纸白
  bgMid:    '#F0EDE5',  // 淡水墨
  bgBottom: '#E0DDD5',  // 深水墨
  bgFar:    '#D0CDC5',  // 远景灰

  // 平台 - 宣纸质感方块
  platform: {
    top:    '#FAF8F0',
    left:   '#E0DDD5',
    right:  '#C8C5BD',
    edge:   '#807870',
    bottom: '#B0A8A0',
  },

  // 阶梯
  stair: {
    top:    '#F5F2EA',
    left:   '#D8D5CD',
    right:  '#C0BDB5',
  },

  // 主控光球 - 水墨色 (墨黑 + 宣纸白, 不用金色)
  orb_palette: {
    paper:  '#F0EBDD',  // 宣纸白
    paperLight: '#FFF5E0',
    ink:    '#1A1410',  // 墨黑
    inkMid: '#3A3A40',  // 中墨
    inkSoft:'#5A5A60',  // 淡墨
    ash:    '#807870',  // 水墨灰
    warm:   '#A8472E',  // 朱砂红(极少量点缀)
  },

  // 保留老字段 - 用作历史兼容,实际显示改用 orb_palette
  gold: {
    main:  '#3A3A40',
    light: '#F0EBDD',
    dark:  '#1A1410',
  },

  // 选择方块颜色
  choice: {
    opportunity: '#C88848',  // 赭石黄
    risk:        '#A84848',  // 朱砂红
    stable:      '#508870',  // 石青绿
    explore:     '#A87898',  // 胭脂粉
    fate:        '#5078A8',  // 天青蓝
    default:     '#807870',  // 水墨灰
  },

  // 光球阶段颜色 - 水墨 + 极淡朱砂
  orb: {
    core:   '#FFF8E8',      // 内核暖白
    inner:  '#F0EBDD',      // 宣纸白
    outer:  '#3A3A40',      // 墨色
    glow:   '#F0EBDD',      // 宣纸白辉光
    think:  '#A8472E',      // 朱砂 - 思考(热)
    summon: '#A87898',      // 胭脂 - 召唤
    summary:'#F0EBDD',      // 宣纸 - 总结
    done:   '#3A3A40',      // 墨色 - 完成
  },

  // Agent 配色 - 完整八卦系统 (演改用水墨,其余保留传统色)
  agent: {
    yan:      { main: '#1A1410', glow: '#F0EBDD', name: '演', icon: '☯' },
    qiangu:   { main: '#C88848', glow: '#E8B880', name: '钱', icon: '☰' },
    luxiang:  { main: '#508870', glow: '#80C8A8', name: '路', icon: '☴' },
    fengyan:  { main: '#A84848', glow: '#E88080', name: '风', icon: '☵' },
    xinhe:    { main: '#A87898', glow: '#D8A8C8', name: '心', icon: '☲' },
    jingyuan: { main: '#685888', glow: '#A898C8', name: '镜', icon: '☶' },
    yuntu:    { main: '#5078A8', glow: '#80A8D8', name: '云', icon: '☷' },
    zhenxing: { main: '#C86848', glow: '#E89878', name: '震', icon: '☳' },
    duiyan:   { main: '#48A898', glow: '#80C8B8', name: '兑', icon: '☱' },
  },

  // 文字颜色
  text: {
    primary:   '#3A3530',
    secondary: '#807870',
    light:     '#FAF8F0',
    ink:       '#2A2520',
  },

  // 水墨色
  ink: {
    light: '#C0BDB5',
    mid:   '#807870',
    dark:  '#3A3530',
  },
};

export function getChoiceColor(branch) {
  if (!branch) return COLORS.choice.default;
  if (branch.condition === 'dice_high') return COLORS.choice.opportunity;
  if (branch.condition === 'dice_low') return COLORS.choice.risk;
  if (branch.targetId?.includes('accept')) return COLORS.choice.stable;
  if (branch.targetId?.includes('reject')) return COLORS.choice.explore;
  if (branch.targetId?.includes('fate')) return COLORS.choice.fate;
  return COLORS.choice.default;
}

/**
 * Agent 八卦位置排列 - 围绕中心，360° 均匀分布
 */
export function getAgentPosition(index, total) {
  const radius = 2.8;
  const angleStep = (Math.PI * 2) / total;
  // 从顶部开始（-Y方向为后，相机看向-Z）
  const angle = -Math.PI / 2 + index * angleStep;
  const heightOffset = Math.sin(index * 0.9 + 0.5) * 0.2;
  return {
    x: Math.cos(angle) * radius,
    y: 1.0 + heightOffset,
    z: Math.sin(angle) * radius,
    angle,
  };
}

/**
 * 选择方块位置 - 前方扇形展开
 */
export function getChoicePosition(index, total) {
  const radius = 5.0;
  const spread = Math.min(Math.PI * 0.9, Math.PI * 0.35 * total);
  const startAngle = -Math.PI / 2 - spread / 2;
  const angleStep = total > 1 ? spread / (total - 1) : 0;
  const angle = startAngle + index * angleStep;
  const heightOffset = Math.sin(index * 0.6 + 0.5) * 0.15;
  return {
    x: Math.sin(angle) * radius,
    y: 0.8 + heightOffset,
    z: -Math.cos(angle) * radius,
    angle,
  };
}

export function getNodeState(id, currentNodeId, visitedNodes, revealedNodes) {
  if (id === currentNodeId) return 'current';
  if (visitedNodes.has(id)) return 'visited';
  if (revealedNodes.has(id)) return 'available';
  return 'locked';
}
