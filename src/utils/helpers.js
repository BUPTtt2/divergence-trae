// Helper functions
export function noop() {}

/**
 * 通用LLM输出清理：移除所有XML包装标签、系统标记泄露
 * 在所有显示LLM文本的组件中使用，确保用户看不到<response>等原始标签
 */
export function sanitizeLLMText(text) {
  if (!text || typeof text !== 'string') return text || '';
  let s = String(text);
  // 1. 先处理 mention 配对标签（含内部内容整体移除，避免残留被 @ 的人名）
  s = s.replace(/<mention\b[^>]*>[\s\S]*?<\/mention>/gi, '');
  // 2. 处理单独不成对的 mention 开/闭标签
  s = s.replace(/<\/?mention\b[^>]*>/gi, '');
  // 3. 处理截断的未闭合标签（字符串末尾残留的 '<xxx...' 这种半截）
  s = s.replace(/<[^>]*$/g, '');
  // 4. 处理 response/output/result/answer/think 等已知系统包装
  s = s
    .replace(/<\/?response[^>]*>/gi, '')
    .replace(/<\/?output[^>]*>/gi, '')
    .replace(/<\/?result[^>]*>/gi, '')
    .replace(/<\/?answer[^>]*>/gi, '')
    .replace(/<\/?think[^>]*>/gi, '')
    .replace(/<\/?thinking[^>]*>/gi, '')
    .replace(/<\/?analysis[^>]*>/gi, '')
    .replace(/<\/?json[^>]*>/gi, '')
    .replace(/<\/?thoughts[^>]*>/gi, '')
    .replace(/<\/?summary[^>]*>/gi, '')
    .replace(/<\/?dialogue[^>]*>/gi, '')
    .replace(/<\/?quote[^>]*>/gi, '');
  // 5. 处理 @user / →@user 协议
  s = s.replace(/→@user\b/gi, '').replace(/@user\b/gi, '');
  // 6. 处理【xxx】这种内部代码括号
  //   - 系统关键词：全部完全剥离，连内部文字都不留
  //   - 普通括注（【张三说】【关于offer】这类）：保留内部文字但去掉括号
  s = s.replace(/【[^】]{0,80}】/g, (m) => {
    const inner = m.slice(1, -1);
    const sysKw = /^(共识|分歧|盲点|结论|观点|摘要|总结|判词|重点|锦囊|禁忌|择路|回溯|你|智囊|用户|系统|内部|调试|log|info|debug|本次推演|众智|最终|阶段|数据|state|phase|节点|标记|提示|注意|提醒|入口|出口|分支|路径|选项|抉择)$/i;
    if (sysKw.test(inner.trim())) return '';
    // 如果内部是纯中文数字序号/短标签（2字以内），说明也是系统标记，全删
    if (inner.trim().length <= 2 && /^[\u4e00-\u9fa5·・・ ]+$/.test(inner.trim())) return '';
    return inner;
  });
  // 7. 处理 emoji 图标（📌🎋☯✅🔴这类干扰性的）
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}]/gu, '');
  // 8. 最后兜底：移除任何残留的孤立 XML/HTML 标签
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9_:-]*[^>]*>/g, '');
  // 9. 折叠空白并 trim
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/**
 * 面向用户的决策文本清理。
 * 除通用包装外，统一把模型/数据层字段名折叠为自然语言，避免命牌、案卷与收藏页泄漏参数名。
 */
export function sanitizeDecisionDisplayText(text) {
  if (!text || typeof text !== 'string') return text || '';
  let s = sanitizeLLMText(text);

  const aliases = {
    startercashflow: '钱包守门人',
    business_evidence: '证据',
    health_conditions: '基础健康情况',
    user_gender: '性别信息',
    exercise_frequency: '运动频率',
    dietary_habits: '饮食习惯',
    weight_goal: '目标',
    current_energy: '精力状态',
    other_factors: '其他影响因素',
    travel_party_budget: '同行与预算',
    travel_party: '同行安排',
    travel_budget: '旅行预算',
    trip_duration: '出行天数',
    accommodation_preference: '住宿偏好',
    work_handover: '工作交接',
    leave_policy: '请假政策',
    leave_pay: '请假薪资',
    goal_weight: '目标权重',
    time_horizon: '时间范围',
    risk_tolerance: '风险承受范围',
  };

  Object.entries(aliases).forEach(([raw, label]) => {
    s = s.replace(new RegExp(`[“”"']?\\b${raw}(?:_\\d+)?\\b[“”"']?`, 'gi'), label);
  });

  s = s
    .replace(/[“”"']?\b(?:business_evidence|gen|sub|market|pos)_\d+\b[“”"']?/gi, '相关信息')
    .replace(/[“”"']?\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b[“”"']?\s*[:：]?/gi, '')
    .replace(/\b(?:field|parameter|slot|schema)\s*[:：]/gi, '')
    .replace(/\s+([，。；：！？])/g, '$1')
    .replace(/([：；，])\1+/g, '$1')
    .replace(/([：；])\s*[：；]/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}
