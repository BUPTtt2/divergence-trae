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
