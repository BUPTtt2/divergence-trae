export const _safeSetTimeout = (cb, delay = 0, ...args) => {
  const fn = () => {
    try {
      cb(...args);
    } catch (e) {
      console.error('[safeSetTimeout] callback error:', e);
    }
  };
  try {
    return setTimeout(fn, delay);
  } catch (e) {
    console.warn('[safeSetTimeout] native setTimeout failed, using fallback');
    // eslint-disable-next-line no-microtask
    return Promise.resolve().then(fn);
  }
};

export const _safeClearTimeout = (id) => {
  try { clearTimeout(id); } catch {}
};

/**
 * 基于问题 + 智囊维度 + 对话内容，本地生成 3~4 个有意义的抉择选项
 * 不依赖后端 dynamicChoices，避免后端返回不相关内容
 * ★ Q6：新增第4个参数 commitText（用户落笔本心），作为"本心锚点"选项优先展示（有异常处理）
 */
export function _buildLocalChoices(question, agents, dialogueMap, commitText = '') {
  const q = (question || '').trim();
  const qSlice = q.length > 18 ? q.slice(0, 18) + '…' : (q || '此事');

  // ★ Q6 本心异常处理：任何异常都不抛，直接当空串走原逻辑
  let safeCommit = '';
  try {
    const raw = String(commitText || '').trim();
    if (raw && raw.length >= 2 && raw.length <= 200) safeCommit = raw;
  } catch (_) { safeCommit = ''; }
  const hasCommit = safeCommit.length > 0;
  const commitShort = hasCommit && safeCommit.length > 16 ? safeCommit.slice(0, 14) + '…' : safeCommit;

  const allTexts = [];
  const agentTexts = []; // 保留每条带人名的，用于生成选项要点
  (agents || []).forEach(a => {
    const t = dialogueMap?.history?.[a.id];
    const arr = Array.isArray(t) ? t : (t ? [t] : []);
    for (const item of arr) {
      const raw = typeof item === 'string' ? item : (item?.text || '');
      if (raw && raw.length >= 6) {
        allTexts.push(raw);
        agentTexts.push({ name: a.name || '智囊', text: raw });
      }
    }
  });
  const yanSolo = dialogueMap?.history?.yan ? (
    Array.isArray(dialogueMap.history.yan) ? dialogueMap.history.yan : [dialogueMap.history.yan]
  ) : [];
  for (const y of yanSolo) {
    const raw = typeof y === 'string' ? y : (y?.text || '');
    if (raw && raw.length >= 6) allTexts.push(raw);
  }
  const mergedText = allTexts.join('。');

  // 从智囊真实发言中抽取 1-2 句短话（每句≤24字内）作为选项要点的 keyPoints）
  const _pickAgentLines = (filter, max = 2) => {
    const sents = [];
    for (const at of agentTexts) {
      const t = String(at.text || '').replace(/【[^】]{0,30}】/g, '').replace(/<[^>]*>/g, '').trim();
      const parts = t.split(/[。！？!?\n]/).map(s => s.trim()).filter(s => s.length >= 4 && s.length <= 26);
      for (const p of parts) {
        if (filter(p, at)) sents.push(`${at.name}：${p}`);
        if (sents.length >= max) break;
      }
      if (sents.length >= max) break;
    }
    return sents;
  };

  const kwPool = new Set();
  const addKw = (regex, def) => { if (regex.test(mergedText) || regex.test(q)) kwPool.add(def); };
  const KEY_HINTS = [
    [/(立即|马上|现在|先做|先上|别等|走起来|先发|出击)/, '立即行动'],
    [/(等等|不急|再看|观望|等一等|条件成熟|等明确)/, '等条件成熟'],
    [/(最坏|风险|损失|兜底|最坏情况|止损|退出)/, '风险兜底'],
    [/(预算|成本|省钱|节省|控制|花费|性价比)/, '成本可控'],
    [/(折中|分步|两步|分阶段|先.*再.*|一部分)/, '分步执行'],
    [/(换个|换方向|换思路|换路径|重新定义|不硬撑)/, '换个定义'],
    [/(机会|窗口|红利|抓紧|抓住|趁现在)/, '抓住窗口'],
    [/(稳|稳健|安全|底线|不冒险|保守)/, '安全底线'],
  ];
  KEY_HINTS.forEach(([r, kw]) => addKw(r, kw));
  if (kwPool.size === 0) {
    ['核心诉求', '落地路径', '退出策略', '机会成本'].forEach(x => kwPool.add(x));
  }
  const kws = [...kwPool].slice(0, 6);

  const _extractLines = (filter, max = 2) => {
    const sents = mergedText.split(/[。！？!?\n]/).map(s => s.trim()).filter(Boolean);
    const qLines = q.split(/[。！？!?\n]/).map(s => s.trim()).filter(Boolean);
    const lines = [];
    for (const s of [...sents, ...qLines]) {
      if (lines.length >= max) break;
      if (filter(s) && s.length >= 6 && s.length <= 60) lines.push(s);
    }
    if (lines.length === 0) {
      lines.push(`关于「${qSlice}」，先抓住${kws[0] || '主要矛盾'}。`);
      lines.push(`同时把${kws[1] || kws[0] || '退出策略'}想清楚，不做不可回退的决策。`);
    }
    return lines;
  };

  // 为每个选项生成：要点 keyPoints（最多 2 条智囊原话 + 1 条该路径核心）
  const _makeKeyPoints = (filterF, coreHint) => {
    const pts = [];
    const agentLines = _pickAgentLines(filterF, 2);
    pts.push(...agentLines);
    if (pts.length < 3) pts.push(coreHint || `核心：${kws[0] || '先动再说'}`);
    while (pts.length < 3) pts.push(`关于「${qSlice}」的路径推演要点`);
    return pts.slice(0, 3);
  };

  // 为每个选项生成动态 verse（不是固定模板，结合这次问题的关键词）
  const _makeVerse = (guaName, theme) => {
    const shortQ = qSlice.length > 10 ? qSlice.slice(0, 10) + '…' : qSlice;
    return `${theme}。问「${shortQ}」，此卦言${guaName}。`;
  };

  return [
    // ★ Q6：有落笔本心的话，把「本心所向」作为第一张牌置顶，重点抓用户自己的选择
    ...(hasCommit ? [{
      id: 'commit_anchor',
      label: `本心所向 · ${commitShort}`,
      desc: `你落笔写下「${safeCommit}」。此念既出，万法随之——所有推演最终都要回归你这颗心的起点。`,
      keyPoints: [
        `你亲笔写了：「${safeCommit.length > 28 ? safeCommit.slice(0, 26) + '…' : safeCommit}」`,
        `以此念为锚，每临分岔自问：我此刻的选择，是否还对得上这句话？`,
        `若 3 个月后回看今日，这句本心之言可会让你心安？可会让你后悔？`
      ],
      verse: _makeVerse('中孚', `鸣鹤在阴，其子和之 · 心诚则灵`),
      color: '#D49838', glowColor: '#F0C870', icon: '䷼', gua: '中孚',
    }] : []),
    {
      id: 'opportunity',
      label: `抓住机会 · 优先${kws[0] || '推进'}`,
      desc: _extractLines(s => /(机会|立即|成长|长期|先做|先发|窗口|红利)/.test(s) || s.includes(kws[0] || '')).join('；') + '。',
      keyPoints: _makeKeyPoints(
        (s, at) => /(机会|先做|立即|上|红利|窗口|成长|推进)/.test(s),
        `先占${kws[0] || '位置'}，再补漏洞`
      ),
      verse: _makeVerse('大有', '元亨。先据要津'),
      color: '#C88848', glowColor: '#E8B880', icon: '☰', gua: '大有',
    },
    {
      id: 'risk',
      label: `规避风险 · 先算${kws[2] || '最坏情况'}`,
      desc: _extractLines(s => /(风险|最坏|损失|兜底|退出|止损|踩坑|雷区|不冒|稳健)/.test(s)).join('；') + '。',
      keyPoints: _makeKeyPoints(
        (s, at) => /(风险|别|不要|最坏|兜底|退出|谨慎|小心|稳健)/.test(s) || /风险|底线|谨慎/.test(at?.stance || ''),
        `先兜${kws[2] || '底'}，再看机会`
      ),
      verse: _makeVerse('坎', '习坎有孚。维心亨'),
      color: '#A84848', glowColor: '#E88080', icon: '☵', gua: '坎',
    },
    {
      id: 'stable',
      label: `稳守当前 · 等${kws[1] || kws[3] || '条件明确'}`,
      desc: _extractLines(s => /(稳|等|条件|不拍板|观望|不急|底线|当前)/.test(s)).join('；') + '。',
      keyPoints: _makeKeyPoints(
        (s, at) => /(稳|等|不急|观望|不做|维持|守住|当前)/.test(s) || /稳|守|保守/.test(at?.stance || ''),
        `守${kws[1] || '底线'}，不动如山`
      ),
      verse: _makeVerse('艮', '艮其背。时止则止'),
      color: '#508870', glowColor: '#80C8A8', icon: '☶', gua: '艮',
    },
    {
      id: 'explore',
      label: `换思路 · ${kws[3] || '重新定义这件事'}`,
      desc: _extractLines(s => /(换|折中|分步|替代|方案|新路径|不硬撑|新思路|重构)/.test(s)).join('；') + '。',
      keyPoints: _makeKeyPoints(
        (s, at) => /(换|试|探索|新路径|分步|不同|另辟|重新)/.test(s) || /探索|创新|折中/.test(at?.stance || ''),
        `${kws[3] || '换个定义'}，别有洞天`
      ),
      verse: _makeVerse('巽', '小亨。利有攸往'),
      color: '#685888', glowColor: '#A898C8', icon: '☴', gua: '巽',
    },
  ];
}
