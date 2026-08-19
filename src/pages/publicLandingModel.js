export const PUBLIC_NAVIGATION = Object.freeze([
  { href: '#method', label: '如何推演' },
  { href: '#walkthrough', label: '体验过程' },
  { href: '#privacy', label: '隐私边界' },
]);

export const WALKTHROUGH_STAGES = Object.freeze([
  { key: 'question', title: '说出真正的纠结', detail: '系统先追问事实、约束和目标，不替你补故事。', signal: '问题建模' },
  { key: 'council', title: '让不同立场交锋', detail: '收益、风险、人性和长期影响同时上桌。', signal: '多视角辩论' },
  { key: 'choice', title: '看清代价再选择', detail: '结论附带前提、反方意见和下一步行动。', signal: '行动决策' },
  { key: 'card', title: '把过程留成命牌', detail: '完整问答和智囊发言可回看，决定不再断片。', signal: '持续复盘' },
]);

export function getLandingActions(authStatus) {
  return {
    primary: { label: '开始一局', href: '/sandbox?new=1' },
    account: authStatus === 'registered'
      ? { label: '我的账号', event: 'open-account-modal' }
      : { label: authStatus === 'loading' ? '账号加载中' : '登录', event: 'open-auth-modal', detail: { type: 'login' }, disabled: authStatus === 'loading' },
  };
}
