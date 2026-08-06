import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { COLORS } from './layoutConfig';
import { getCustomAgents, getMarketAgents, recommendSubscribedAgents, subscribeAgent, unsubscribeAgent, deleteCustomAgent } from '../../utils/customAgent';
import { recallRelevantMemories } from '../../services/memoryStore';
// 零预设：不再导入 detectQuestionType / getAgentsForQuestion，改为按 inference.dimensions 与关键词做市场推荐
import { sanitizeLLMText } from '../../utils/helpers';

/* ============================================================
   Step 6: Mention 标签可视化辅助
   - preprocessMentionsInText: 把 LLM 输出的 <mention> XML 标签
     转换为可见短文本 `内容 →@风眼`（保留打字机效果）
   - renderTextWithMentions: 把 →@风眼 部分用朱砂红 span 包裹
   - 降级格式 @agentName 也走同样样式
============================================================ */

// 智囊 id -> name 兜底映射（allAgents 缺失时用）
const FALLBACK_ID_TO_NAME = {
  qiangu: '钱谷', fengyan: '风眼', luxiang: '路向', xinhe: '心禾',
  jingyuan: '镜渊', yuntu: '云图', zhenxing: '震行', duiyan: '兑言',
  luyou: '远足', yangsheng: '养生', fadu: '法度', xuezhe: '学者',
  falv: '法度', jiankang: '养生', jiaoyu: '师道', jishu: '匠心',
};
// 与 Game.jsx 保持一致的主题色常量（避免 undefined 引用）
const BORDER_COLOR = '#C8A850';

/* ============================================================
   智囊统一视觉工具（A4 修复：图标不一致 / 选中联动 / 重复）
   1. AgentAvatar: 统一 24x24 头像（trigram/icon/首字圆形头像）
   2. ensureUniqueIds: 强制所有 agent.id 全局唯一，解决点 A 选 B 的联动 bug
   3. dedupeAgents: 按 name+stance 组合去重，解决同一角色多分区重复渲染
============================================================ */
function AgentAvatar({ agent, size = 24 }) {
  const color = agent?.color || '#C8A850';
  const glow = agent?.glow || '#F0D890';
  const trigram = agent?.trigram || agent?.icon || agent?.guaIcon;
  const name = agent?.name || '?';
  const firstChar = String(name).trim().charAt(0) || '?';
  const fontSize = Math.round(size * 0.5);

  // 优先：显式 icon/trigram 单字（乾坤八卦等）
  if (trigram && /^[☰☷☳☴☵☲☶☱☯乾坤震巽坎离艮兑䷀-䷿]$/.test(String(trigram).trim())) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 30% 30%, ${glow}40 0%, ${color}30 45%, ${color}18 100%)`,
          border: `1px solid ${color}80`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color,
          fontSize: Math.round(size * 0.62),
          lineHeight: 1,
          flexShrink: 0,
          fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
          boxShadow: `inset 0 0 ${Math.round(size*0.2)}px ${color}30`,
        }}
      >
        {trigram}
      </div>
    );
  }
  // 兜底：名字首字圆形头像
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 30% 30%, ${glow}30 0%, ${color}20 50%, rgba(60,55,50,0.6) 100%)`,
        border: `1px solid ${color}60`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        fontSize,
        fontWeight: 700,
        lineHeight: 1,
        flexShrink: 0,
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
      }}
    >
      {firstChar}
    </div>
  );
}

/**
 * 强制所有 agent.id 全局唯一
 * 解决点"背包客"同时选中"老中医"的联动 bug（根因：id 冲突/undefined）
 */
function ensureUniqueIds(agents, prefix = 'agt') {
  const seen = new Set();
  return agents.map((a, i) => {
    if (!a) return a;
    let id = a.id || a.name || `${prefix}_${i}`;
    // 处理冲突：追加序号直到唯一
    let finalId = id;
    let idx = 1;
    while (seen.has(finalId)) {
      finalId = `${id}__${idx++}`;
    }
    seen.add(finalId);
    if (finalId === a.id) return a;
    return { ...a, id: finalId, _origId: a.id };
  });
}

/**
 * 按 name+stance 组合去重（同一角色/人设只保留一个，优先放演·推演视角）
 */
function dedupeAgents(primary, secondary = []) {
  const seen = new Set();
  const out = [];
  const push = (a) => {
    if (!a) return;
    const key = `${String(a.name || '').trim()}::${String(a.stance || '').trim()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  primary.forEach(push);
  secondary.forEach(push);
  return out;
}

function CollapsibleAgentSection({ title, titleColor, agents, renderItem, defaultVisible = 3, hideHeader = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(agents) || agents.length === 0) return null;
  const visibleAgents = expanded ? agents : agents.slice(0, defaultVisible);
  const hiddenCount = agents.length - defaultVisible;
  const hasMore = hiddenCount > 0;
  return (
    <div style={{ marginBottom: hideHeader ? '0' : '14px' }}>
      {!hideHeader && (
        <div style={{
          fontSize: '11px', color: titleColor, marginBottom: '8px',
          letterSpacing: '0.15em', fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
        }}>{title}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visibleAgents.map((agent, idx) => renderItem(agent, idx))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(prev => !prev)}
          style={{
            width: '100%', padding: '6px 10px', marginTop: '8px',
            background: 'transparent',
            border: `1px solid ${titleColor}40`,
            borderRadius: '3px',
            color: titleColor,
            fontSize: '10px',
            cursor: 'pointer',
            fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
            letterSpacing: '0.1em',
          }}
        >
          {expanded ? '收起' : `展开更多（${hiddenCount}）`}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Step 4: 工具调用可视化辅助
   - TOOL_EMOJI_MAP / TOOL_NAME_MAP: 工具 → emoji/中文名
   - ToolLoadingCard: 发言前的 loading 卡片（水墨风格，虚线边框）
   - ToolFootnote: 发言底部脚注（小字号灰阶斜体，点击展开）
============================================================ */
const TOOL_EMOJI_MAP = {
  web_search: '🔍',
  stock_query: '📈',
  exchange_rate: '💱',
  salary_calc: '💰',
  company_info: '🏢',
  macro_data: '📊',
  calendar_query: '📅',
  law_search: '⚖️',
  job_search: '💼',
  industry_report: '📑',
  tech_stack: '⚙️',
  github_trending: '🐙',
};
const TOOL_NAME_MAP = {
  web_search: '搜索',
  stock_query: '股价',
  exchange_rate: '汇率',
  salary_calc: '薪资',
  company_info: '公司',
  macro_data: '宏观数据',
  calendar_query: '日历',
  law_search: '法规',
  job_search: '职位',
  industry_report: '行业报告',
  tech_stack: '技术栈',
  github_trending: '趋势',
};
function getToolEmoji(tool) { return TOOL_EMOJI_MAP[tool] || '🔧'; }
function getToolName(tool) { return TOOL_NAME_MAP[tool] || tool; }

/**
 * 把 LLM 输出的 <mention> XML 标签转换为可见短文本
 * 保留 mention 内容，附加 `→@agentName` 标记
 * 降级 @agentName 不变（已自然显示）
 */
function preprocessMentionsInText(text, agents) {
  if (!text || typeof text !== 'string') return text || '';

  // 0. 先清理LLM输出的XML包装标签（不应暴露给用户）
  let processed = sanitizeLLMText(text);

  // 构建 id -> name 映射
  const idToName = { ...FALLBACK_ID_TO_NAME };
  if (Array.isArray(agents)) {
    for (const a of agents) {
      if (a && a.id && a.name) idToName[a.id] = a.name;
    }
  }

  // 1. 严格 XML：<mention to="agentId" type="..." snippet="...">内容</mention>
  processed = processed.replace(
    /<mention\s+to="([^"]+)"\s+type="([^"]+)"\s+snippet="([^"]*)"\s*>([^<]+)<\/mention>/g,
    (full, to, type, snippet, content) => {
      const name = idToName[to] || to;
      if (to === 'user' || name === 'user') return content.trim();
      return `${content.trim()} →@${name}`;
    }
  );
  // 2. 宽松 XML：<mention to="...">内容</mention>
  processed = processed.replace(
    /<mention\s+[^>]*to="([^"]+)"[^>]*>([^<]+)<\/mention>/g,
    (full, to, content) => {
      const name = idToName[to] || to;
      if (to === 'user' || name === 'user') return content.trim();
      return `${content.trim()} →@${name}`;
    }
  );
  // 3. 闭合 <mention .../> 标签（无内容）也清掉，避免显示原文
  processed = processed.replace(/<mention[^>]*\/>/g, '');
  // 4. 清理残留的孤立XML标签（任何<xxx>或</xxx>）
  processed = processed.replace(/<\/?[a-zA-Z][a-zA-Z0-9_]*[^>]*>/g, '');

  return processed;
}

/**
 * 把字符串渲染为 React 节点，把 →@agentName 部分用朱砂红 span 包裹
 * 同时处理降级的 @agentName 格式
 */
function renderTextWithMentions(str, agents) {
  if (!str) return str;
  // 构建 name 集合（用于匹配降级 @name）
  const nameSet = new Set(Object.values(FALLBACK_ID_TO_NAME));
  if (Array.isArray(agents)) {
    for (const a of agents) {
      if (a && a.name) nameSet.add(a.name);
    }
  }
  const names = Array.from(nameSet).sort((a, b) => b.length - a.length); // 长名优先匹配

  // 匹配 →@agentName 或 @agentName
  const pattern = new RegExp(`→@([\\u4e00-\\u9fa5]{2,4})|@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

  const parts = [];
  let lastIdx = 0;
  let m;
  let key = 0;
  while ((m = pattern.exec(str)) !== null) {
    if (m.index > lastIdx) {
      parts.push(<span key={key++}>{str.slice(lastIdx, m.index)}</span>);
    }
    const targetName = m[1] || m[2];
    parts.push(
      <span
        key={key++}
        style={{
          color: '#A84848',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          fontSize: '0.88em',
          marginLeft: '2px',
          marginRight: '1px',
          cursor: 'help',
          textShadow: '0 0 4px rgba(168,72,72,0.4)',
        }}
        title={`反驳/补充/追问 → ${targetName}`}
      >
        {m[0]}
      </span>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < str.length) {
    parts.push(<span key={key++}>{str.slice(lastIdx)}</span>);
  }
  return parts.length > 0 ? parts : str;
}

/**
 * Agent / 演 对话浮层
 * - agent_debate 阶段显示当前发言的 Agent
 * - summary / path_reveal 阶段显示演 的总结
 * - 无框、居中、字距宽松，带打字机效果
 */
export default function AgentDialogueOverlay({ phase, question, activeAgentIdx, activeAgents, agentDialogues, selectedAgentIds, onAgentToggle, onConfirmAgents, onGoCast, awaitingUser, currentResponse, setCurrentResponse, onUserAdvance, agentCallResults, onFeedback, debateConvergence, mentions, toolCallState, candidateAgents, inference, onSaveGameState, onShowFeedbackToast }) {
  const navigate = useNavigate();
  // iPad/平板触屏优化检测（width<=1024 的平板，不含手机）
  const isIPad = typeof window !== 'undefined' && (/iPad/i.test(navigator.userAgent) || (window.innerWidth > 768 && window.innerWidth <= 1024));
  const [customAgents, setCustomAgents] = useState([]);
  const [marketAgents, setMarketAgents] = useState([]);
  const [feedbackGiven, setFeedbackGiven] = useState({}); // { [agentId]: 'positive'|'negative' }
  // Step 4: 打字机完成状态（控制工具结果脚注的显示时机，发言结束后才露出）
  const [typingDone, setTypingDone] = useState({}); // { [agentId]: true }

  // agent_select 阶段：如果显式传入了 candidateAgents 就用 candidateAgents 作为候选池（支持按维度新建的临时视角）
  //               否则回退到 activeAgents（旧语义，兼容未传的情况）
  //               A3 Fix: 最后再追加 marketAgents（市集临时选择的 Agent 也能直接上场，不必强制订阅）
  const baseCandidatePool = Array.isArray(candidateAgents) && candidateAgents.length > 0
    ? candidateAgents
    : (activeAgents || []);
  const candidatePool = dedupeAgents([], [
    ...baseCandidatePool,
    ...(Array.isArray(marketAgents) ? marketAgents : []),
  ]);
  // 临时 market agent 选中时，如果 ID 和候选池里冲突，resolveMarketAgent 会保证映射正确
  const findAgentInAllPools = (id) => {
    if (!id) return null;
    // 1. 精确匹配
    let a = candidatePool.find(a => a.id === id);
    if (a) return a;
    // 2. 市集订阅映射（marketId → subscribed 的自定义 id）
    a = candidatePool.find(a => a.originMarketId === id || a.marketId === id);
    if (a) return a;
    // 3. 前缀匹配：sub_xxx 订阅前缀 / __n 唯一化后缀
    const idLow = String(id).toLowerCase();
    a = candidatePool.find(a => {
      const aid = String(a.id || '').toLowerCase();
      return aid === idLow || aid.replace(/^sub_/, '') === idLow.replace(/^sub_/, '')
        || aid.replace(/__\d+$/, '') === idLow.replace(/__\d+$/, '');
    });
    return a || null;
  };

  // agent_select 阶段 market 推荐：零预设，用 inference.dimensions/perspectivePool + question 关键词打分，不再调用 detectQuestionType
  useEffect(() => {
    if (phase === 'agent_select') {
      setCustomAgents(getCustomAgents());
      try {
        const market = getMarketAgents();
        const q = question || '';
        let recommended = [];
        if (market.length > 0) {
          // 推演维度(perspective) -> 标签映射（仅用于将 inference.dimensions 翻译为关键词）
          const perspectiveTags = {
            financial: ['投资', '理财', '财务', '钱'],
            risk: ['风险', '安全'],
            reflection: ['反思', '人生', '意义'],
            health: ['健康', '养生', '身体'],
            experience: ['体验', '实地'],
            relationship: ['情感', '家庭', '关系'],
            career: ['职场', '职业', '工作'],
            legal: ['法律', '合规', '合同'],
            education: ['学业', '教育', '学习'],
            pet: ['宠物', '养猫', '养狗'],
            travel: ['旅行', '旅游', '出发', '攻略'],
            city: ['城市', '搬家', '迁移'],
            startup: ['创业', '商业', '项目'],
          };
          // 从 inference 收集标签：perspectivePool.stance + dimensions + questionType.label
          const relevantTagsSet = new Set();
          const pushTag = (t) => { if (t && typeof t === 'string') relevantTagsSet.add(t.trim()); };
          if (Array.isArray(inference?.perspectivePool)) {
            inference.perspectivePool.forEach(a => {
              (a.tags || []).forEach(pushTag);
              pushTag(a.stance);
              pushTag(a.perspective);
              pushTag(a.name);
            });
          }
          if (Array.isArray(inference?.dimensions)) {
            inference.dimensions.forEach(d => {
              pushTag(d.name);
              pushTag(d.label);
              (d.tags || []).forEach(pushTag);
              (perspectiveTags[d.id] || []).forEach(pushTag);
            });
          }
          const plan = inference?.plan;
          if (plan) {
            (plan.tags || []).forEach(pushTag);
            if (plan.questionType) {
              const qt = plan.questionType;
              pushTag(typeof qt === 'string' ? qt : (qt.label || qt.name));
            }
            (plan.dimensions || []).forEach(d => {
              pushTag(d.name || d.label);
              (d.tags || []).forEach(pushTag);
            });
          }
          if (inference?.questionType) {
            const qt = inference.questionType;
            pushTag(typeof qt === 'string' ? qt : (qt.label || qt.name));
          }
          // 问题关键词再补一组启发式（兜底：问题 2-4 字词组与 perspective 映射
          const perspectiveKeywords = {
            financial: ['钱', '费用', '预算', '价格', '房租', '租金', '租', '房', '收入', '支出', '成本', '工资', '理财', '投资', '财务', '花'],
            risk: ['风险', '安全', '危险', '隐患', '可靠', '保障', '赔', '亏'],
            reflection: ['意义', '人生', '反思', '价值', '思考', '值得', '为什么', '是否'],
            health: ['健康', '身体', '养生', '病', '医疗', '睡眠', '运动'],
            experience: ['体验', '实地', '亲历', '考察', '实践', '走', '看', '试'],
            travel: ['西藏', '新疆', '云南', '旅游', '旅行', '自驾', '露营', '徒步', '景点', '攻略', '度假'],
            pet: ['猫', '狗', '宠物', '养猫', '养狗', '猫咪', '狗狗'],
            city: ['北京', '上海', '搬家', '租房', '城市'],
          };
          if (q) {
            Object.entries(perspectiveKeywords).forEach(([p, kws]) => {
              if (kws.some(kw => q.includes(kw))) {
              (perspectiveTags[p] || []).forEach(pushTag);
              }
            });
          }
          const relevantTags = Array.from(relevantTagsSet);
          // 已选智囊的视角文本（用于视角互补推荐）
          const selectedStances = (candidatePool || []).map(a => `${a.stance || ''} ${a.name || ''}`).join(' ');
          // 基于 tags 和 stance 文本匹配打分
          const scored = market.map(a => {
            let score = 0;
            const text = `${a.stance || ''} ${a.desc || ''} ${a.name || ''} ${(a.tags || []).join(' ')}`.toLowerCase();
            // tags 匹配加分
            for (const tag of relevantTags) {
              const t = tag.toLowerCase();
              if (t && text.includes(t)) score += 5;
            }
            // 问题中的 2-4 字词组匹配 stance/desc
            const tokens = q.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
            for (const t of tokens) {
              if (text.includes(t.toLowerCase())) score += 2;
            }
            // 视角互补：如果已选智囊没有此视角，加分（鼓励补充缺失视角）
            if (selectedStances && a.stance && !selectedStances.includes(a.stance)) {
              score += 1;
            }
            return { ...a, _score: score };
          });
          scored.sort((a, b) => b._score - a._score);
          // 推荐 score>0 的，最多 3 个
          recommended = scored.filter(a => a._score > 0).slice(0, 3);
          // 兜底：始终保证 marketAgents 至少 3 个，用热门智囊(按 subs 排序)补齐
          if (recommended.length < 3) {
            const hotSorted = [...market].sort((a, b) => (b.subs || 0) - (a.subs || 0));
            const existingIds = new Set(recommended.map(a => a.id));
            for (const a of hotSorted) {
              if (recommended.length >= 3) break;
              if (existingIds.has(a.id)) continue;
              recommended.push({ ...a, _isHot: true });
              existingIds.add(a.id);
            }
          }
        }
        setMarketAgents(recommended);
      } catch (e) { setMarketAgents([]); }
    }
    // P0 Fix: 删掉 candidatePool 依赖！candidatePool 是每次 render 新生成的派生数组，
    // 放进依赖会导致 setMarketAgents()→re-render→candidatePool引用变→再trigger effect 死循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question, inference]);

  // Step 4: 切换智囊或新发言到达时，重置该智囊的打字机完成标记
  // 避免第二轮辩论时脚注在打字开始前就显示
  useEffect(() => {
    if (phase !== 'agent_debate' || activeAgentIdx < 0 || !activeAgents) return;
    const agents = activeAgents.filter(a => a.role !== 'master');
    const agent = agents[activeAgentIdx];
    if (agent && typingDone[agent.id]) {
      setTypingDone(prev => {
        const next = { ...prev };
        delete next[agent.id];
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAgentIdx, agentDialogues, phase]);

  const handleGoCast = () => {
    if (typeof onSaveGameState === 'function') onSaveGameState();
    // 传 snapshotSid（固定 key，用别名显示给用户可读标签），让 Agents 页显示「返回推演台」按钮
    const snapshotKey = 'yance_game_session';
    try { sessionStorage.setItem('resume_session_id', snapshotKey); } catch {}
    navigate('/agents', {
      state: { snapshotSid: snapshotKey, snapshotLabel: userInput ? `关于「${String(userInput).slice(0, 14)}」的推演` : '推演进行中' },
    });
  };

  // 分析当前已选智囊覆盖了哪些视角（动态从Agent stance提取，不硬编码维度）
  const getPerspectiveCoverage = () => {
    if (!candidatePool) return { covered: new Set(), all: [] };
    const presetAgents = candidatePool.filter(a => a.role !== 'master');
    // 去重：合并presetAgents和customAgents，按ID去重
    const seenIds = new Set();
    const allAvailableAgents = [...presetAgents, ...customAgents].filter(a => {
      if (!a || !a.id) return false;
      if (seenIds.has(a.id)) return false;
      seenIds.add(a.id);
      return true;
    });
    const selectedAgents = allAvailableAgents.filter(a => selectedAgentIds?.has(a.id));

    // 从所有候选Agent的stance中动态提取视角标签
    const allPerspectives = [];
    const seenPerspectives = new Set();
    allAvailableAgents.forEach(a => {
      const label = (a.stance || a.perspectiveLabel || '').replace(/视角$/, '').trim();
      if (label && !seenPerspectives.has(label)) {
        seenPerspectives.add(label);
        allPerspectives.push(label);
      }
    });

    const covered = new Set();
    selectedAgents.forEach(a => {
      const label = (a.stance || a.perspectiveLabel || '').replace(/视角$/, '').trim();
      if (label) covered.add(label);
    });

    return { covered, all: allPerspectives, selectedCount: selectedAgents.length };
  };

  if (phase === 'agent_select') {
    // 用 candidatePool（显式传入候选池）而不是 activeAgents，因为此时 activeAgents 还没被用户选中，为空
    const pool = candidatePool || activeAgents || [];
    if (!pool || pool.length === 0) return null;

    // ========== A4 修复：唯一 id + name+stance 去重 + 订阅后归属 ==========
    // 1. 先拿到所有订阅过的市集 agent（customAgents 里的），按 name+stance 建表
    const rawCustom = ensureUniqueIds(customAgents, 'cus');
    const subscribedKeys = new Set();
    for (const a of rawCustom) {
      subscribedKeys.add(`${String(a.name || '').trim()}::${String(a.stance || '').trim()}`);
    }
    // 2. presetAgents：排除已订阅的市集 agent（订阅后归"我的智囊"，不再混演视角）
    const rawPresetAll = ensureUniqueIds(pool.filter(a => a.role !== 'master'), 'pre');
    const rawPreset = rawPresetAll.filter(a => {
      const isFromMarket = !!(a.marketId || a.originMarketId);
      const key = `${String(a.name || '').trim()}::${String(a.stance || '').trim()}`;
      return !(isFromMarket && subscribedKeys.has(key));
    });
    // 3. customAgentsClean：name+stance 去重，剔除 presetAgents（非市集）里也有的同名角色
    const dedupedCustom = dedupeAgents([], rawCustom).filter(a => {
      const key = `${String(a.name || '').trim()}::${String(a.stance || '').trim()}`;
      return !rawPreset.some(p => {
        const pFromMarket = !!(p.marketId || p.originMarketId);
        if (pFromMarket) return false;
        return `${String(p.name || '').trim()}::${String(p.stance || '').trim()}` === key;
      });
    });
    const presetAgents = rawPreset;
    const customAgentsClean = dedupedCustom;
    const allAgents = [...presetAgents, ...customAgentsClean];

    // === T5：演推荐 / 演新维度 标记 ===
    const recommendedSet = new Set(inference?.recommendedAgentIds || []);
    const isRecommended = (agentId) => recommendedSet.has(agentId) ||
      presetAgents.some(p => p.id === agentId && (p._origId && recommendedSet.has(p._origId)));
    const isGeneratedAgent = (agent) => agent?.isGenerated || agent?.id?.startsWith('gen_') || String(agent?.id || '').includes('gen_');

    // === Q2-1 修复：市集智囊 ID 解析（市集ID → 订阅后真实ID） ===
    // 构建查找表：marketId / originMarketId / id → 已订阅的 customAgent
    const subscribedByMarketId = new Map();
    for (const ca of customAgentsClean) {
      if (ca.originMarketId) subscribedByMarketId.set(ca.originMarketId, ca);
      if (ca.marketId) subscribedByMarketId.set(ca.marketId, ca);
      subscribedByMarketId.set(ca.id, ca);
      // 同步 origId（去重时可能被重命名）
      if (ca._origId) subscribedByMarketId.set(ca._origId, ca);
    }
    // 解析市集 agent 到真实可选中的 ID；未订阅时仅返回原市集 id（不自动订阅，避免订阅无效）
    const resolveMarketAgent = (marketAgent) => {
      const existing = subscribedByMarketId.get(marketAgent.marketId || marketAgent.id);
      if (existing) return { agent: existing, resolvedId: existing.id, newlySubscribed: false };
      return { agent: marketAgent, resolvedId: marketAgent.id, newlySubscribed: false };
    };
    // 订阅 / 取消订阅（市集按钮用，独立 onClick，不触发选中）
    const toggleSubscribe = (e, marketAgent) => {
      e.stopPropagation();
      e.preventDefault();
      const originId = marketAgent.marketId || marketAgent.id;
      const existing = subscribedByMarketId.get(originId);
      if (existing) {
        unsubscribeAgent(existing);
      } else {
        subscribeAgent(marketAgent);
      }
      // 刷新 customAgents state（重新读 localStorage）
      const fresh = ensureUniqueIds(getCustomAgents(), 'cus');
      const dedupedFresh = dedupeAgents([], fresh).filter(a => {
        const key = `${String(a.name || '').trim()}::${String(a.stance || '').trim()}`;
        return !presetAgents.some(p => `${String(p.name || '').trim()}::${String(p.stance || '').trim()}` === key);
      });
      setCustomAgents(fresh); // 存完整 fresh（用于内部），渲染用 local dedupedFresh 会在下次 render 重新计算
      // 强制重新同步 subscribedByMarketId（setCustomAgents 触发重渲染后会重算）
      subscribedByMarketId.clear();
      for (const ca of dedupedFresh) {
        if (ca.originMarketId) subscribedByMarketId.set(ca.originMarketId, ca);
        if (ca.marketId) subscribedByMarketId.set(ca.marketId, ca);
        subscribedByMarketId.set(ca.id, ca);
      }
    };

    // 移动端/iPad: 全屏面板；桌面端 agent_select 阶段: 居中大面板；其他阶段：320px 侧边栏
    const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || /iPad|iPhone|Android/i.test(navigator.userAgent));
    const isSelectPhase = phase === 'agent_select';
    const panelWidth = isMobile ? '100%' : (isSelectPhase ? 'min(92vw, 1080px)' : '320px');
    const panelStyle = isMobile
      ? { left: 0, right: 0, top: 0, bottom: 0, width: '100%', borderLeft: 'none', borderRadius: 0 }
      : (isSelectPhase
        ? {
            // ★ 不用 top/left + transform 居中（framer-motion 的 animate 会覆盖 transform）
            // 改用 inset:0 + margin:auto，这是 fixed 定居中唯一不受 transform 干扰的方案
            top: 0, left: 0, right: 0, bottom: 0,
            margin: 'auto',
            width: 'min(94vw, 1120px)',
            maxHeight: 'min(90vh, 840px)',
            borderRadius: '16px',
            border: '1px solid #C8A85055',
            boxShadow: '0 24px 80px rgba(0,0,0,0.85), 0 0 60px rgba(200,168,80,0.12)',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }
        : { right: 0, top: 0, bottom: 0, width: '320px', borderLeft: '1px solid #C8A85030' });

    // --- agent_select 阶段：三栏拆分（市集 / 我的 / 原生系统）---
    const marketPool = presetAgents.filter(a => !!(a.marketId || a.originMarketId));
    const nativePoolAll = presetAgents.filter(a => !(a.marketId || a.originMarketId));
    const myPool = customAgentsClean;

    // ★ 先收集"我的智囊"里所有 name+stance/id，市集栏 + 系统原生栏 都用它做全局过滤
    //   Fix: 订阅后同时出现在"我的智囊"+"市集"+"演·系统视角" 三栏双份重叠
    const _myPoolNameKeys = new Set();
    const _myPoolIdKeys = new Set();
    for (const ma of (myPool || [])) {
      _myPoolNameKeys.add(`${String(ma.name || '').trim()}::${String(ma.stance || '').trim()}`);
      if (ma.id) _myPoolIdKeys.add(ma.id);
      if (ma.originMarketId) _myPoolIdKeys.add(ma.originMarketId);
      if (ma.marketId) _myPoolIdKeys.add(ma.marketId);
    }

    // ★ 原生系统池：排除"我的智囊"中已存在的同名角色（name+stance 或 id 命中任一都排除）
    const nativePool = nativePoolAll.filter(p => {
      const nsKey = `${String(p.name || '').trim()}::${String(p.stance || '').trim()}`;
      if (_myPoolNameKeys.has(nsKey)) return false;
      if (p.id && _myPoolIdKeys.has(p.id)) return false;
      return true;
    });

    const recMarket = marketPool.filter(a => isRecommended(a.id));
    const otherMarket = marketPool.filter(a => !isRecommended(a.id));
    const recNative = nativePool.filter(a => isRecommended(a.id));
    const otherNative = nativePool.filter(a => !isRecommended(a.id));

    const recommendedPreset = presetAgents.filter(a => isRecommended(a.id));
    const otherPreset = presetAgents.filter(a => !isRecommended(a.id));
    const sortedCustomAgents = [
      ...customAgentsClean.filter(a => !a.isSubscribed),
      ...customAgentsClean.filter(a => a.isSubscribed),
    ];

    // ★ 市集去重列表：三重去重 + 已订阅Agent彻底排除
    const _mktSeen1 = new Set(); // name+stance 去重
    const _mktSeen2 = new Set(); // id/marketId 去重
    const mergedMarketAgents = [];
    for (const list of [recMarket, (marketAgents || []), otherMarket]) {
      for (const a of list) {
        if (!a) continue;
        const nameKey = `${String(a.name || '').trim()}::${String(a.stance || '').trim()}`;
        const idKey = a.marketId || a.originMarketId || a.id;
        // ① 已订阅的（name+stance在"我的智囊"里有）→ 直接跳过，市集栏不再显示
        if (_myPoolNameKeys.has(nameKey)) continue;
        // ② id/originMarketId 已被订阅 → 跳过
        if (idKey && subscribedByMarketId.has(idKey)) continue;
        // ③ 自身重复 → 跳过
        if (_mktSeen1.has(nameKey)) continue;
        if (idKey && _mktSeen2.has(idKey)) continue;
        _mktSeen1.add(nameKey);
        if (idKey) _mktSeen2.add(idKey);
        mergedMarketAgents.push(a);
      }
    }

    const renderPresetAgent = (agent) => {
      const isSelected = selectedAgentIds?.has(agent.id);
      const color = COLORS.agent[agent._origId || agent.id] || { main: agent.color || '#C8A850', glow: agent.glow || '#F0D890' };
      const gen = isGeneratedAgent(agent);
      const rec = isRecommended(agent.id);
      const isFromMarket = !!(agent.marketId || agent.originMarketId);
      const isCustom = !!(agent._isCustom || agent.isCustom);
      const fromOfficial = !gen && !isFromMarket && !isCustom;
      let srcLabel = '官方·推演';
      let srcColor = '#D7A44A';
      if (isFromMarket) { srcLabel = '市集·智选'; srcColor = '#80C8A8'; }
      else if (isCustom) { srcLabel = '我的·铸造'; srcColor = '#F0B880'; }
      const marketKey = agent.marketId || agent.originMarketId;
      const isSubscribed = marketKey && subscribedByMarketId.has(marketKey);
      const handleSubscribe = (e) => {
        if (!marketKey) return;
        toggleSubscribe(e, agent);
      };
      return (
        <motion.button
          key={agent.id}
          onClick={() => onAgentToggle?.(agent.id)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: isIPad ? '12px 14px' : '10px 14px',
            textAlign: 'left',
            background: rec
              ? `linear-gradient(135deg, ${color.glow}18 0%, rgba(60,55,50,0.5) 60%)`
              : (isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.5)'),
            border: `1px ${rec ? 'solid' : 'solid'} ${isSelected ? color.main : (rec ? `${color.main}88` : '#3A3530')}`,
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            position: 'relative',
            boxShadow: rec ? `inset 0 0 0 1px ${color.main}2A, 0 0 14px ${color.main}22` : undefined,
          }}
        >
          <AgentAvatar agent={{ ...agent, color: color.main, glow: color.glow }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{ color: color.main, fontSize: '13px', fontWeight: '600', fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}>{agent.name}</div>
              {gen && (
                <span style={{
                  fontSize: '8px', color: '#E0C080', background: 'linear-gradient(90deg, #8A392520 0%, #C8A85020 100%)',
                  border: '1px solid #E0C08088', borderRadius: '2px', padding: '0 5px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
                  flexShrink: 0,
                }}>演·新维度</span>
              )}
              {rec && !gen && (
                <span style={{
                  fontSize: '8px', color: '#C8A050', border: '1px solid #C8A05080',
                  borderRadius: '2px', padding: '0 5px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
                  flexShrink: 0,
                }}>★ 演推荐</span>
              )}
              {!gen && (
                <span style={{
                  fontSize: '8px', color: srcColor, border: `1px solid ${srcColor}55`,
                  borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
                  flexShrink: 0,
                }}>{srcLabel}</span>
              )}
              {isFromMarket && (
                <span
                  onClick={handleSubscribe}
                  title={isSubscribed ? '已订阅，点击取消' : '订阅此智囊 → 订阅后可在「我的智囊-市集订阅」里直接选'}
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    color: isSubscribed ? '#1a1a1a' : '#fff',
                    background: isSubscribed ? '#80C8A8' : 'linear-gradient(135deg, #A888C8 0%, #8868C8 100%)',
                    border: 'none',
                    boxShadow: isSubscribed ? '0 0 10px rgba(128,200,168,0.35)' : '0 0 12px rgba(168,136,200,0.45)',
                    borderRadius: '10px', padding: '2px 8px', letterSpacing: '0.08em',
                    fontFamily: '"Ma Shan Zheng", serif',
                    flexShrink: 0,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {isSubscribed ? '✓ 已订' : '＋ 订阅'}
                </span>
              )}
            </div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>{agent.stance}</div>
            {agent.desc && (
              <div style={{ color: '#666', fontSize: '10px', marginTop: '2px', lineHeight: 1.3 }}>{agent.desc}</div>
            )}
            {Array.isArray(agent.tags) && agent.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                {agent.tags.slice(0, 3).map((t, i) => (
                  <span key={i} style={{
                    fontSize: '8px', color: '#8A8378',
                    border: `1px solid ${BORDER_COLOR}35`,
                    padding: '0 4px', borderRadius: '8px',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ color: isSelected ? color.main : (rec ? color.main : '#555'), fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{isSelected ? '✓' : (rec ? '★' : '')}</div>
        </motion.button>
      );
    };

    const renderAgentBtn = (agent, isSubscribed = false) => {
      const isSelected = selectedAgentIds?.has(agent.id);
      const color = { main: agent.color || '#C8A850', glow: agent.glow || '#F0D890' };
      const srcLabel = agent?._srcLabel || (isSubscribed ? '市集·订阅' : '我的智囊');
      const srcColor = isSubscribed ? '#80C8A8' : '#F0B880';
      const gen = isGeneratedAgent(agent);
      const rec = isRecommended(agent.id);
      const handleToggleSub = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!isSubscribed) {
          deleteCustomAgent(agent.id);
        } else {
          unsubscribeAgent(agent);
        }
        const fresh = ensureUniqueIds(getCustomAgents(), 'cus');
        setCustomAgents(fresh);
      };
      return (
        <motion.button
          key={agent.id}
          onClick={() => onAgentToggle?.(agent.id)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: isIPad ? '12px 14px' : '10px 14px',
            textAlign: 'left',
            background: rec
              ? `linear-gradient(135deg, ${color.glow}18 0%, rgba(60,55,50,0.5) 60%)`
              : (isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.5)'),
            border: `1px solid ${isSelected ? color.main : (rec ? `${color.main}88` : '#3A3530')}`,
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            position: 'relative',
            boxShadow: rec ? `inset 0 0 0 1px ${color.main}2A, 0 0 14px ${color.main}22` : undefined,
          }}
        >
          <AgentAvatar agent={{ ...agent, color: color.main, glow: color.glow }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: color.main, fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}>
              {agent.name}
              {gen && (
                <span style={{
                  fontSize: '8px', color: '#E0C080', background: 'linear-gradient(90deg, #8A392520 0%, #C8A85020 100%)',
                  border: '1px solid #E0C08088', borderRadius: '2px', padding: '0 5px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
                  flexShrink: 0,
                }}>演·新维度</span>
              )}
              {rec && !gen && (
                <span style={{
                  fontSize: '8px', color: '#C8A050', border: '1px solid #C8A05080',
                  borderRadius: '2px', padding: '0 5px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", serif',
                  flexShrink: 0,
                }}>★ 演推荐</span>
              )}
              <span style={{
                fontSize: '8px', color: srcColor, border: `1px solid ${srcColor}55`,
                borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em',
                fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
                flexShrink: 0,
              }}>{srcLabel}</span>
              <span
                onClick={handleToggleSub}
                title={isSubscribed ? '点击取消订阅' : '点击删除此智囊'}
                style={{
                  fontSize: '8px',
                  color: isSubscribed ? '#80C8A8' : '#E8A080',
                  border: `1px solid ${isSubscribed ? '#80C8A855' : '#E8A08055'}`,
                  borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em',
                  fontFamily: '"Ma Shan Zheng", serif',
                  flexShrink: 0,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {isSubscribed ? '订（点取消）' : '删'}
              </span>
            </div>
            <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>{agent.stance}</div>
            {agent.desc && (
              <div style={{ color: '#666', fontSize: '10px', marginTop: '2px', lineHeight: 1.3 }}>{agent.desc}</div>
            )}
            {Array.isArray(agent.tags) && agent.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
                {agent.tags.slice(0, 3).map((t, i) => (
                  <span key={i} style={{
                    fontSize: '8px', color: '#8A8378',
                    border: `1px solid ${BORDER_COLOR}35`,
                    padding: '0 4px', borderRadius: '8px',
                  }}>{t}</span>
                ))}
              </div>
            )}
          </div>
          <div style={{ color: isSelected ? color.main : (rec ? color.main : '#555'), fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{isSelected ? '✓' : (rec ? '★' : '')}</div>
        </motion.button>
      );
    };

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          // ★ 择智弹窗：position: fixed 相对浏览器视口（不是父容器）
          position: isMobile ? 'fixed' : (isSelectPhase ? 'fixed' : 'absolute'),
          background: isSelectPhase ? 'rgba(10, 10, 15, 0.96)' : 'rgba(10, 10, 15, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          padding: isMobile ? '18px 14px' : (isSelectPhase ? '24px 28px 22px 28px' : '22px 26px 18px 26px'),
          zIndex: isSelectPhase ? 9999 : 30,
          // ★ 关键：择智阶段 overflow:hidden（不是 auto！）
          // 让外层不滚动，内层三栏区域 flex:1+overflowY:auto 自己滚
          // 底部按钮（footer）用 flexShrink:0 钉在底部，永远可见
          maxHeight: isSelectPhase ? (isMobile ? '100vh' : 'min(90vh, 840px)') : '85vh',
          overflowY: isSelectPhase ? 'hidden' : 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          ...panelStyle,
        }}
      >
        {/* 标题区 — flexShrink:0 不被压缩 */}
        <div style={{ marginBottom: '20px', textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '18px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif', letterSpacing: '0.2em' }}>择智</div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>演已列出问题涉及的视角，请按需挑选智囊（至少选 1 位）</div>
        </div>

        {/* 演的视角覆盖评估 */}
        {(() => {
          const cov = getPerspectiveCoverage();
          return (
            <div style={{
              padding: '10px 12px', marginBottom: '14px',
              background: 'rgba(200,168,80,0.05)', border: '1px dashed #C8A85025',
              borderRadius: '6px', flexShrink: 0,
            }}>
              <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '6px', letterSpacing: '0.1em' }}>☯ 视角覆盖</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: cov.all.length > 0 && cov.selectedCount < cov.all.length ? '6px' : '0' }}>
                {cov.all.map(p => (
                  <span key={p} style={{
                    fontSize: '9px', padding: '2px 6px', borderRadius: '2px',
                    background: cov.covered.has(p) ? 'rgba(200,168,80,0.2)' : 'rgba(255,255,255,0.03)',
                    color: cov.covered.has(p) ? '#C8A850' : '#4A4035',
                    border: `1px solid ${cov.covered.has(p) ? '#C8A85040' : '#2A2520'}`,
                  }}>{p}</span>
                ))}
              </div>
              {cov.all.length > 0 && cov.selectedCount < cov.all.length && (
                <div style={{ fontSize: '10px', color: '#8A8070', lineHeight: 1.5 }}>
                  <span style={{ color: '#C8A850' }}>演曰：</span>部分视角未选，可按需增减智囊。
                </div>
              )}
              {cov.all.length === 0 && (
                <div style={{ fontSize: '10px', color: '#8A8070', lineHeight: 1.5 }}>
                  <span style={{ color: '#C8A850' }}>演曰：</span>已初选智囊，可按需增减。
                </div>
              )}
            </div>
          );
        })()}

        {/* 三栏水平布局：左=我的智囊 / 中=市集 / 右=系统原生 */}
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden', paddingRight: '4px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '14px' : '16px',
        }}>
          {/* 栏1：我的智囊（铸造+订阅） */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, overflow: 'hidden' }}>
            <div style={{
              fontSize: '12px', color: '#F0B880', fontWeight: 700, letterSpacing: '0.18em',
              fontFamily: '"Noto Serif SC", "PingFang SC", "Ma Shan Zheng", serif',
              padding: '4px 0 4px 10px', borderLeft: '3px solid #F0B880',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>我 · 自建 / 订阅</span>
              <span style={{ fontSize: '10px', color: '#8A7860', fontWeight: 400, letterSpacing: '0.05em' }}>
                {sortedCustomAgents.length} 位 · {sortedCustomAgents.filter(a => a.isSubscribed).length} 订阅
              </span>
            </div>
            {sortedCustomAgents.length === 0 ? (
              <div style={{
                padding: '24px 14px', textAlign: 'center',
                fontSize: '11px', color: '#888', fontStyle: 'italic',
                background: 'rgba(240,184,128,0.04)',
                border: '1px dashed #F0B88040', borderRadius: '6px',
                lineHeight: 1.6,
              }}>还没有智囊 ·<br />下方「铸造台」自建，或市集订阅</div>
            ) : (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '8px',
                // ★ 不用 maxHeight（flex 布局下不可靠），用 flex:1 + minHeight:0 让父级约束高度
                flex: 1, minHeight: 0,
                overflowY: 'auto', paddingRight: '3px',
              }}>
                {sortedCustomAgents.map(a => <div key={a.id}>{renderAgentBtn(a, !!a.isSubscribed)}</div>)}
              </div>
            )}
          </div>

          {/* 分隔线 1 */}
          <div style={{
            width: isMobile ? undefined : '1px',
            height: isMobile ? '1px' : 'auto',
            background: 'linear-gradient(180deg, transparent 0%, #C8A85040 30%, #C8A85040 70%, transparent 100%)',
            flexShrink: 0,
          }} />

          {/* 栏2：市集（演推荐+市集API） */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, overflow: 'hidden' }}>
            <div style={{
              fontSize: '12px', color: '#A888C8', fontWeight: 700, letterSpacing: '0.18em',
              fontFamily: '"Noto Serif SC", "PingFang SC", "Ma Shan Zheng", serif',
              padding: '4px 0 4px 10px', borderLeft: '3px solid #A888C8',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>☯ 市集智选</span>
              <span style={{ fontSize: '10px', color: '#A898C0', fontWeight: 400, letterSpacing: '0.05em' }}>
                开关订阅 · 选后加入"我的"
              </span>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px',
              flex: 1, minHeight: 0,
              overflowY: 'auto', paddingRight: '3px',
            }}>
              {mergedMarketAgents.map((agent, idx) => {
                // 兼容两种来源：(1) preset pool 里的marketPreset (2) marketAgents(推荐)
                const src = agent;
                const { resolvedId } = resolveMarketAgent(src);
                const originId = src.marketId || src.originMarketId || src.id;
                const isSelected = selectedAgentIds?.has(resolvedId);
                const isSubscribed = subscribedByMarketId.has(originId);
                const color = { main: src.color || '#A888C8', glow: src.glow || '#C8A8E8' };
                const rec = isRecommended(src.id) || !!src.recommendReason;
                const uniqKey = `mkt_${originId || src.id || idx}`;
                return (
                  <motion.button
                    key={uniqKey}
                    onClick={() => onAgentToggle?.(resolvedId)}
                    whileHover={{ scale: 1.015 }}
                    whileTap={{ scale: 0.99 }}
                    style={{
                      padding: '11px 12px',
                      textAlign: 'left',
                      background: rec
                        ? `linear-gradient(135deg, ${color.glow}14 0%, rgba(60,55,50,0.6) 70%)`
                        : (isSelected ? `${color.glow}20` : 'rgba(60, 55, 50, 0.6)'),
                      border: `1px ${rec ? 'solid' : (isSelected ? 'solid' : 'dashed')} ${isSelected ? color.main : (rec ? `${color.main}80` : '#4A4440')}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      position: 'relative',
                    }}
                  >
                    <AgentAvatar agent={{ ...src, color: color.main, glow: color.glow }} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                          <div style={{ color: color.main, fontSize: '13px', fontWeight: 600, fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif' }}>{src.name}</div>
                          {rec && <span style={{ fontSize: '8px', color: '#C8A050', border: '1px solid #C8A05080', borderRadius: '2px', padding: '0 5px', letterSpacing: '0.1em', fontFamily: '"Ma Shan Zheng", serif' }}>★演荐</span>}
                          <span style={{ fontSize: '8px', color: '#A888C8', border: '1px solid #A888C855', borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em', fontFamily: '"Ma Shan Zheng", serif', flexShrink: 0 }}>市集</span>
                        </div>
                        {/* 订阅：独立 checkbox switch（点开关不触发选中 agent） */}
                        <label
                          title={isSubscribed ? '已订阅，点开关取消 → 从"我的"移除' : '订阅 → 加入"我的智囊"，下次直接选'}
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggleSubscribe(e, src); }}
                          style={{
                            flexShrink: 0,
                            width: '38px',
                            height: '20px',
                            borderRadius: '10px',
                            background: isSubscribed ? '#80C8A8' : '#3A3530',
                            border: `1px solid ${isSubscribed ? '#80C8A8' : '#4A4440'}`,
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: isSubscribed ? '0 0 10px rgba(128,200,168,0.45)' : 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            userSelect: 'none',
                          }}
                        >
                          <span style={{
                            position: 'absolute',
                            top: '50%',
                            left: isSubscribed ? 'calc(100% - 15px - 2px)' : '2px',
                            transform: 'translateY(-50%)',
                            width: '15px', height: '15px',
                            borderRadius: '50%',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            transition: 'left 0.2s ease',
                          }} />
                        </label>
                      </div>
                      <div style={{ color: '#888', fontSize: '11px', marginTop: '3px' }}>{src.stance}</div>
                      {src.desc && (<div style={{ color: '#7A6888', fontSize: '10px', marginTop: '2px', lineHeight: 1.4 }}>{src.desc}</div>)}
                      {src.recommendReason && (<div style={{ color: '#A888C8', fontSize: '9px', marginTop: '3px', fontStyle: 'italic', lineHeight: 1.4 }}>☯ {src.recommendReason}</div>)}
                    </div>
                    <div style={{ color: isSelected ? color.main : (rec ? '#C8A050' : '#4A4440'), fontSize: '15px', flexShrink: 0, marginTop: '2px', width: '18px', textAlign: 'center' }}>{isSelected ? '✓' : (rec ? '★' : '')}</div>
                  </motion.button>
                );
              })}
              {mergedMarketAgents.length === 0 && (
                <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: '11px', color: '#777', fontStyle: 'italic', border: '1px dashed #555', borderRadius: '6px' }}>暂无市集智囊</div>
              )}
            </div>
          </div>

          {/* 分隔线 2 */}
          <div style={{
            width: isMobile ? undefined : '1px',
            height: isMobile ? '1px' : 'auto',
            background: 'linear-gradient(180deg, transparent 0%, #C8A85040 30%, #C8A85040 70%, transparent 100%)',
            flexShrink: 0,
          }} />

          {/* 栏3：系统原生 / 演视角 */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, overflow: 'hidden' }}>
            <div style={{
              fontSize: '12px', color: '#D7A44A', fontWeight: 700, letterSpacing: '0.18em',
              fontFamily: '"Noto Serif SC", "PingFang SC", "Ma Shan Zheng", serif',
              padding: '4px 0 4px 10px', borderLeft: '3px solid #D7A44A',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>演 · 系统视角</span>
              <span style={{ fontSize: '10px', color: '#8A7860', fontWeight: 400, letterSpacing: '0.05em' }}>
                ★ 推荐 {recNative.length} · 共 {nativePool.length}
              </span>
            </div>
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '8px',
              flex: 1, minHeight: 0,
              overflowY: 'auto', paddingRight: '3px',
            }}>
              {recNative.length > 0 && recNative.map(a => <div key={`nr_${a.id}`}>{renderPresetAgent(a)}</div>)}
              {otherNative.length > 0 && otherNative.map(a => <div key={`no_${a.id}`}>{renderPresetAgent(a)}</div>)}
              {nativePool.length === 0 && (
                <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: '11px', color: '#777', fontStyle: 'italic', border: '1px dashed #555', borderRadius: '6px' }}>暂无系统原生视角</div>
              )}
            </div>
          </div>
        </div>

        {/* 选中状态栏：数 + 清空按钮 — flexShrink:0 钉在底部 */}
        <div style={{
          marginTop: '18px',
          padding: '10px 12px',
          background: 'rgba(200,168,80,0.06)',
          border: '1px solid #C8A85025',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '12px', color: '#C8A850', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>
            已选 <span style={{ fontWeight: '700', fontSize: '15px' }}>{selectedAgentIds?.size || 0}</span> 位智囊
          </div>
          {(selectedAgentIds?.size || 0) > 0 && (
            <button
              onClick={() => onAgentToggle?.(null, true)}
              style={{
                background: 'transparent',
                border: '1px solid #3A3530',
                borderRadius: '3px',
                padding: '3px 10px',
                fontSize: '10px',
                color: '#888',
                cursor: 'pointer',
              }}
            >
              清空
            </button>
          )}
        </div>

        {/* 去铸造台 — flexShrink:0 */}
        <div style={{ marginTop: '14px', flexShrink: 0 }}>
          <motion.button
            onClick={() => {
              if (onGoCast) onGoCast();
              else navigate('/agents');
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              width: '100%',
              padding: isIPad ? '14px 10px' : '10px',
              background: 'rgba(200,168,80,0.08)',
              border: '1px dashed #C8A85050',
              borderRadius: '4px',
              color: '#C8A850',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
              letterSpacing: '0.15em',
              transition: 'all 0.3s ease',
            }}
          >
            ✦ 视角不全？去铸造台定制专属智囊 →
          </motion.button>
        </div>

        <motion.button
          onClick={() => onConfirmAgents?.()}
          disabled={(selectedAgentIds?.size || 0) === 0}
          whileHover={(selectedAgentIds?.size || 0) > 0 ? { scale: 1.02 } : {}}
          whileTap={(selectedAgentIds?.size || 0) > 0 ? { scale: 0.98 } : {}}
          style={{
            marginTop: '12px',
            width: '100%',
            padding: isIPad ? '15px 12px' : '12px',
            background: (selectedAgentIds?.size || 0) > 0 ? '#C8A850' : '#3A3530',
            border: 'none',
            borderRadius: '4px',
            color: (selectedAgentIds?.size || 0) > 0 ? '#1a1a1a' : '#666',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (selectedAgentIds?.size || 0) > 0 ? 'pointer' : 'not-allowed',
            fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
            letterSpacing: '0.1em',
            opacity: (selectedAgentIds?.size || 0) > 0 ? 1 : 0.6,
            pointerEvents: (selectedAgentIds?.size || 0) > 0 ? 'auto' : 'none',
            flexShrink: 0,
          }}
        >
          {(selectedAgentIds?.size || 0) > 0 ? `召 ${selectedAgentIds.size} 位智囊 · 开辩` : '请至少选一位智囊'}
        </motion.button>
      </motion.div>
    );
  }

  // agent_debate 阶段 - 当前发言 Agent
  if (phase === 'agent_debate') {
    if (activeAgentIdx < 0) return null;
    if (!activeAgents || activeAgents.length === 0) return null;
    const agents = activeAgents.filter((a) => a.role !== 'master');
    const agent = agents[activeAgentIdx];
    if (!agent) return null;
    const dialogue = agentDialogues?.[agent.id];
    const color = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };

    // Step 4: 当前智囊的工具调用状态（仅匹配当前发言智囊）
    const agentToolState = toolCallState && toolCallState.agentId === agent.id
      ? toolCallState : null;

    // 无发言且正在调工具 → 显示 loading 卡片（不 return null，让用户看到工具调用过程）
    if (!dialogue) {
      if (agentToolState && agentToolState.status === 'calling') {
        return (
          <AnimatePresence mode="wait">
            <ToolLoadingCard key={'tool-' + activeAgentIdx} agent={agent} toolState={agentToolState} />
          </AnimatePresence>
        );
      }
      return null;
    }

    // 协作关系标签（反驳/补充/追问 @目标智囊）
    const collaboration = agentCallResults?.[agent.id]?.collaboration;
    const collabMap = { rebuttal: { label: '反驳', color: '#E88080' }, support: { label: '补充', color: '#80C8A8' }, question: { label: '追问', color: '#F0D890' } };
    const collabInfo = collaboration && collaboration.msgType !== 'claim' && collaboration.targetName
      ? collabMap[collaboration.msgType]
      : null;
    // Q2-2 新增：发言来源标识 — LLM真实生成 / 本地预设降级
    const dialogueSource = agentCallResults?.[agent.id]?.source;
    const sourceMap = {
      llm:    { label: '灵 · 真智生成', color: '#80C8A8', tip: '由后端大模型实时生成' },
      preset: { label: '实 · 本地降级', color: '#C8A850', tip: '后端不可达，使用本地预设模板兜底' },
      local:  { label: '实 · 本地降级', color: '#C8A850', tip: '后端不可达，使用本地规则生成' },
    };
    const sourceInfo = dialogueSource ? (sourceMap[dialogueSource] || null) : null;
    // 立场强度：反驳=3强 / 追问=2中 / 补充=1弱，默认 permanent=3 dynamic=2
    let stanceStrength = agent.role === 'permanent' ? 3 : 2;
    if (collaboration?.msgType === 'rebuttal') stanceStrength = 3;
    else if (collaboration?.msgType === 'question') stanceStrength = 2;
    else if (collaboration?.msgType === 'support') stanceStrength = 1;
    // 情绪态度联动分歧度：分歧大(consensusScore<0.6)时情绪更激烈，+1（上限3）
    const consensusScore = debateConvergence?.consensusScore;
    const isDivergent = typeof consensusScore === 'number' && consensusScore < 0.6;
    if (isDivergent && collaboration?.msgType !== 'support') {
      stanceStrength = Math.min(3, stanceStrength + 1);
    }
    // Step 6: 拒答消息检测 — 从 mentions 中找当前 agent 的拒答消息，
    // 或发言文本含「拒答：」字样（向后兼容 Step 5 拒答格式）
    const currentMention = Array.isArray(mentions)
      ? mentions.find(m => m && m.agentId === agent.id)
      : null;
    const isRefusal = !!(currentMention?.refusalReason) ||
      (typeof dialogue === 'string' && dialogue.includes('拒答：'));
    // Step 4: 工具结果脚注（打字机完成后显示）
    const toolResults = agentToolState?.results || [];
    return (
      <DialogueFrame key={'debate-' + activeAgentIdx} color={color} name={agent.name} stance={agent.stance} progress={`${activeAgentIdx + 1} / ${agents.length}`} stanceStrength={stanceStrength} refused={isRefusal} isGenerated={agent.isGenerated}>
        {collabInfo && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 12px',
              marginBottom: '10px',
              background: `${collabInfo.color}1A`,
              border: `1px solid ${collabInfo.color}55`,
              borderRadius: '12px',
              color: collabInfo.color,
              fontSize: '11px',
              letterSpacing: '0.15em',
              fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
            }}
          >
            {collabInfo.label} · {collaboration.targetName}
          </motion.div>
        )}
        {/* Q2-2 新增：发言来源可视化标识 */}
        {sourceInfo && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            title={sourceInfo.tip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 12px',
              marginBottom: '10px',
              marginLeft: collabInfo ? '6px' : '0',
              background: `${sourceInfo.color}14`,
              border: `1px dashed ${sourceInfo.color}66`,
              borderRadius: '12px',
              color: sourceInfo.color,
              fontSize: '10px',
              letterSpacing: '0.12em',
              fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
              cursor: 'help',
            }}
          >
            {sourceInfo.label}
          </motion.div>
        )}
        {isRefusal && currentMention?.refusalReason && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 12px',
              marginBottom: '10px',
              background: '#6b72801A',
              border: '1px dashed #6b7280',
              borderRadius: '12px',
              color: '#9CA3AF',
              fontSize: '11px',
              letterSpacing: '0.15em',
              fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
            }}
          >
            拒答 · {currentMention.refusalReason}
          </motion.div>
        )}
        <TypewriterText text={dialogue} agentColor={color} agents={agents} onDone={() => setTypingDone(prev => ({ ...prev, [agent.id]: true }))} />
        {/* Step 4.2: 工具结果脚注 — 打字机完成后显示 */}
        {toolResults.length > 0 && typingDone[agent.id] && (
          <ToolFootnote results={toolResults} />
        )}
        {/* 智囊调校：反馈 chip（受用/失言 → 存入 memoryStore，下次发言注入） */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'center' }}>
          {[
            { type: 'positive', icon: '✦', label: '受用', color: '#80C8A8', toast: '✦ 受用 · 已记入智囊调教档案' },
            { type: 'negative', icon: '✕', label: '失言', color: '#E88080', toast: '✕ 失言 · 智囊下次发言会更注意分寸' },
          ].map(fb => {
            const given = feedbackGiven[agent.id];
            const isSelected = given === fb.type;
            const isDisabled = given && !isSelected;
            return (
              <motion.button
                key={fb.type}
                onClick={() => {
                  if (given) return;
                  setFeedbackGiven(prev => ({ ...prev, [agent.id]: fb.type }));
                  onFeedback?.(agent.id, fb.type, dialogue);
                  // ★ Fix: 即时 toast 反馈，用户点下去立刻看到"生效了"
                  onShowFeedbackToast?.(fb.toast, fb.color, agent.id);
                }}
                disabled={!!isDisabled}
                whileHover={!given ? { scale: 1.05 } : {}}
                whileTap={!given ? { scale: 0.95 } : {}}
                animate={isSelected ? { boxShadow: [`0 0 0 ${fb.color}00`, `0 0 14px ${fb.color}80`, `0 0 0 ${fb.color}00`], transition: { duration: 0.6, repeat: 0 } } : {}}
                style={{
                  padding: isIPad ? '12px 16px' : '4px 14px',
                  background: isSelected ? `${fb.color}25` : 'transparent',
                  border: `1px solid ${isSelected ? fb.color : '#3A3530'}`,
                  borderRadius: '12px',
                  color: isSelected ? fb.color : '#888',
                  fontSize: '11px',
                  cursor: isDisabled ? 'default' : 'pointer',
                  fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
                  letterSpacing: '0.1em',
                  opacity: isDisabled ? 0.3 : 1,
                  pointerEvents: 'auto',
                }}
              >
                {fb.icon} {fb.label}
              </motion.button>
            );
          })}
        </div>
      </DialogueFrame>
    );
  }

  // yan_analyze / reflecting / summary / path_reveal 阶段 - 演 的发言
  if (phase === 'yan_analyze' || phase === 'reflecting' || phase === 'summary' || phase === 'path_reveal') {
    const dialogue = agentDialogues?.yan;
    const history = (agentDialogues?.history?.yan || []).filter(Boolean);
    const color = COLORS.agent.yan;
    const stances = {
      yan_analyze: '析问定策',
      reflecting: '反思汇聚',
      summary: '梳理总结',
      path_reveal: '总揽全局',
    };
    if (!dialogue && history.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '16%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            textAlign: 'center',
          }}
        >
          <YanThinkingSteps question={question} inference={inference} candidateAgents={candidateAgents} />
        </motion.div>
      );
    }

    // yan_analyze 阶段：渲染完整问答历史（用户的每次回答都可见），最后一条高亮当前待答问题
    if (phase === 'yan_analyze' && history.length > 0) {
      const turns = history.map((h, idx) => {
        const isUser = typeof h === 'string' && h.startsWith('【你】');
        if (isUser) {
          return { kind: 'user', idx, text: String(h).replace(/^【你】/, '') };
        }
        const tObj = typeof h === 'object' && h ? h : { text: String(h), source: 'preset' };
        return { kind: 'yan', idx, text: tObj.text || '', source: tObj.source || 'preset' };
      });
      return (
        <DialogueFrame key="yan-history" color={color} name="演" stance={stances.yan_analyze} progress="">
          <div
            style={{
              maxHeight: 'clamp(40vh, 52vh, 62vh)',
              overflowY: 'auto',
              paddingRight: '4px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--gold-deep, #C8A850) transparent',
            }}
            className="ingot-scroll"
          >
            {turns.map((t, i) => {
              const isLast = i === turns.length - 1;
              if (t.kind === 'user') {
                return (
                  <motion.div
                    key={`u-${i}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.02 }}
                    style={{
                      margin: '10px 0 14px 20%',
                      padding: '10px 14px',
                      background: 'linear-gradient(135deg, rgba(200, 168, 80, 0.12), rgba(200, 168, 80, 0.05))',
                      borderLeft: `2px solid ${color}`,
                      borderRadius: '2px 8px 8px 8px',
                      fontSize: '13px',
                      lineHeight: 1.9,
                      color: '#EDE6D4',
                      fontFamily: '"Noto Serif SC", serif',
                      letterSpacing: '0.03em',
                    }}
                  >
                    <div style={{ fontSize: '10px', color: '#B8A070', marginBottom: '4px', letterSpacing: '0.2em' }}>
                      你 · 已确证
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{sanitizeLLMText(t.text)}</div>
                  </motion.div>
                );
              }
              return (
                <motion.div
                  key={`y-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.02 }}
                  style={{
                    margin: '10px 20% 4px 0',
                    padding: isLast && awaitingUser ? '14px 16px' : '10px 14px',
                    background: isLast && awaitingUser
                      ? 'linear-gradient(135deg, rgba(232, 198, 112, 0.18), rgba(232, 198, 112, 0.06))'
                      : 'rgba(120, 98, 60, 0.08)',
                    border: isLast && awaitingUser ? `1px solid ${color}66` : '1px solid transparent',
                    borderRadius: '8px 2px 8px 8px',
                    boxShadow: isLast && awaitingUser ? `0 0 22px ${color}22` : 'none',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#9A8860', marginBottom: '6px', letterSpacing: '0.2em' }}>
                    演 · {t.source === 'llm' ? '灵思' : '策问'} {isLast && awaitingUser && '· 待答'}
                  </div>
                  {isLast && awaitingUser ? (
                    <TypewriterText text={sanitizeLLMText(t.text)} agentColor={color} />
                  ) : (
                    <div style={{
                      fontSize: '14px', lineHeight: 1.95, whiteSpace: 'pre-wrap',
                      color: '#F4ECD6', fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.04em',
                    }}>
                      {sanitizeLLMText(t.text)}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </DialogueFrame>
      );
    }

    return (
      <DialogueFrame key={phase} color={color} name="演" stance={stances[phase]} progress="">
        <TypewriterText text={sanitizeLLMText(dialogue)} agentColor={color} />
      </DialogueFrame>
    );
  }

  return null;
}

/* ============================================================
   用户回答输入框 - 演问/Agent 发言后的回应窗口
   水墨风格，浮在对话下方，可输入+继续
============================================================ */
function UserResponseInput({ value, onChange, onSubmit, placeholder, subtle = false }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '12%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        width: '88%',
        maxWidth: '660px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <textarea
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value.slice(0, 240))}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          style={{
            width: '100%',
            maxHeight: '22vh',
            minHeight: '54px',
            overflowY: 'auto',
            padding: '12px 16px',
            background: subtle ? 'rgba(20, 18, 15, 0.75)' : 'rgba(15, 12, 8, 0.85)',
            backdropFilter: 'blur(8px)',
            border: `1px solid ${subtle ? '#C8A85040' : '#C8A85060'}`,
            borderRadius: '4px',
            color: '#F0EDE5',
            fontSize: '14px',
            fontFamily: '"Noto Serif SC", serif',
            lineHeight: 1.8,
            letterSpacing: '0.05em',
            outline: 'none',
            resize: 'none',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gold-deep, #C8A850) transparent',
            boxShadow: subtle ? 'none' : `0 0 24px rgba(200, 168, 80, 0.15)`,
          }}
        />
        <motion.div
          aria-hidden
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '-1px',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, #C8A850, transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>
      <motion.button
        onClick={onSubmit}
        whileHover={{ scale: 1.04, y: -1 }}
        whileTap={{ scale: 0.96 }}
        style={{
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #C8A850 0%, #A88830 100%)',
          border: '1px solid #F0D890',
          borderRadius: '4px',
          color: '#1a1a1a',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
          letterSpacing: '0.15em',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(200, 168, 80, 0.3)',
          whiteSpace: 'nowrap',
          alignSelf: 'stretch',
        }}
      >
        继续
      </motion.button>
    </motion.div>
  );
}

/* ============================================================
   对话外框 - 名字 + 立场 + 进度 + 正文
   增强:水墨晕染背景 + 微浮动 + 墨滴粒子 + 名字滴入
============================================================ */
function DialogueFrame({ color, name, stance, progress, stanceStrength = 0, showAiLabel = true, refused = false, isGenerated = false, children }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.98 }}
        animate={{
          opacity: refused ? 0.5 : 1,
          y: [0, -4, 0],  // 缓慢呼吸
          scale: 1,
        }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{
          opacity: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
          scale: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
        }}
        style={{
          position: 'absolute',
          left: '50%',
          top: '16%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          maxWidth: '660px',
          width: '88%',
          pointerEvents: 'none',
        }}
      >
        {/* Step 6: 拒答消息虚线灰阶边框 - 覆盖在内容外，不破坏水墨布局 */}
        {refused && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '-16px -20px',
              border: '1px dashed #6b7280',
              borderRadius: '6px',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}
        {/* 水墨晕染背景层 */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: '110%',
            height: '180%',
            pointerEvents: 'none',
            zIndex: -1,
          }}
        >
          {/* 中心暖光晕 */}
          <motion.div
            animate={{ opacity: [0.18, 0.28, 0.18] }}
            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80%',
              height: '60%',
              background: `radial-gradient(ellipse at center, ${color.glow}30 0%, ${color.glow}10 40%, transparent 70%)`,
              filter: 'blur(20px)',
            }}
          />
          {/* 宣纸暖底 */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '70%',
              height: '50%',
              background: 'radial-gradient(ellipse at center, rgba(240,235,221,0.08) 0%, transparent 65%)',
              filter: 'blur(15px)',
            }}
          />
        </div>

        {/* 墨滴粒子(4 个) - 缓慢漂浮 */}
        {[
          { x: '-30%', y: '-40%', size: 4, dur: 6, delay: 0 },
          { x: '120%', y: '-20%', size: 3, dur: 7, delay: 1.5 },
          { x: '-25%', y: '80%', size: 5, dur: 8, delay: 0.8 },
          { x: '110%', y: '90%', size: 3, dur: 5.5, delay: 2.2 },
        ].map((p, i) => (
          <motion.div
            key={i}
            aria-hidden
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0, 0.6, 0.3, 0.6, 0],
              scale: [0, 1, 1.2, 1, 0],
              x: [0, 8, -4, 6, 0],
              y: [0, -6, 4, -3, 0],
            }}
            transition={{
              duration: p.dur,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: color.glow,
              boxShadow: `0 0 ${p.size * 2}px ${color.glow}`,
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* 顶部小标签 - 名字滴入 + 立场滑入 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            marginBottom: '20px',
            letterSpacing: '0.2em',
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: -16, rotateZ: -8 }}
            animate={{ opacity: 1, y: 0, rotateZ: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontSize: '15px',
              color: color.glow,
              fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
              fontWeight: 700,
              textShadow: `0 0 12px ${color.glow}, 0 0 4px #000`,
              paddingLeft: '0.3em',
            }}
          >
            {name}
            {isGenerated && (
              <span style={{
                fontSize: '8px', color: '#F0D890', border: '1px solid #F0D89055',
                borderRadius: '2px', padding: '0 4px', letterSpacing: '0.1em',
                marginLeft: '6px', verticalAlign: 'middle',
                fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
              }}>演造</span>
            )}
          </motion.span>
          {stance && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.5, ease: 'easeOut' }}
              style={{
                fontSize: '11px',
                color: '#A09888',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.3em',
                paddingLeft: '0.3em',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              {stance}
            </motion.span>
          )}
          {progress && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.7, ease: 'easeOut' }}
              style={{
                fontSize: '11px',
                color: '#6A6560',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.2em',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              {progress}
            </motion.span>
          )}
          {/* 立场强度三段条 - 情绪态度可视化 */}
          {stanceStrength > 0 && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.7, delay: 0.6, ease: 'easeOut' }}
              style={{ display: 'flex', alignItems: 'center', gap: '14px' }}
            >
              <span style={{ width: '1px', height: '12px', background: '#3A3530' }} />
              <span style={{ display: 'flex', gap: '3px', alignItems: 'flex-end' }} title={`立场强度 ${stanceStrength}/3`}>
                {[1, 2, 3].map((n) => (
                  <span
                    key={n}
                    style={{
                      width: '3px',
                      height: n === 1 ? '6px' : n === 2 ? '9px' : '12px',
                      background: n <= stanceStrength ? color.glow : '#3A3530',
                      borderRadius: '1px',
                      boxShadow: n <= stanceStrength ? `0 0 4px ${color.glow}` : 'none',
                    }}
                  />
                ))}
              </span>
            </motion.span>
          )}
        </div>

        {/* 对话内容 — 强制 pointerEvents auto（外层是none防阻挡场景点击） */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          style={{
            maxHeight: 'clamp(32vh, 44vh, 52vh)',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--gold-deep, #C8A850) transparent',
            pointerEvents: 'auto',
            touchAction: 'pan-y',
            paddingRight: '6px',
          }}
          className="ingot-scroll-ui"
        >
          {children}
          {/* webkit滚动条可见化 — 保证Chrome/Safari也能看到手指拖动条 */}
          <style>{`
            .ingot-scroll-ui::-webkit-scrollbar,
            .ingot-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
            .ingot-scroll-ui::-webkit-scrollbar-track,
            .ingot-scroll::-webkit-scrollbar-track { background: rgba(200,168,80,0.04); border-radius: 4px; }
            .ingot-scroll-ui::-webkit-scrollbar-thumb,
            .ingot-scroll::-webkit-scrollbar-thumb {
              background: linear-gradient(180deg, #C8A850, #A8472E);
              border-radius: 4px;
              box-shadow: 0 0 6px rgba(200,168,80,0.4);
            }
            .ingot-scroll-ui::-webkit-scrollbar-thumb:hover,
            .ingot-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #F0D890, #C8A850); }
          `}</style>
        </motion.div>

        {/* AI 生成内容标识 - 法律合规硬约束 */}
        {showAiLabel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            style={{
              textAlign: 'center',
              marginTop: '14px',
              fontSize: '9px',
              color: '#6A6560',
              letterSpacing: '0.25em',
              fontFamily: '"Noto Serif SC", serif',
            }}
          >
            AI 生成内容，仅供参考
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ============================================================
   Step 4.1: 工具调用 Loading 卡片
   - 智囊发言前显示，水墨风格，虚线边框
   - 收到 tool_call：显示 emoji + "调用XX工具中…" + 进度条
   - 收到 tool_result：变为 ✓ + summary，发言开始时由 AnimatePresence 淡出
============================================================ */
function ToolLoadingCard({ agent, toolState }) {
  const { currentTool, results = [], status } = toolState;
  // 最近的 tool_result（已完成态展示 ✓ + summary）
  const lastResult = results.length > 0 ? results[results.length - 1] : null;
  const isResultDone = !!lastResult && status !== 'calling';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.8, ease: 'easeInOut' } }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: 'absolute',
        left: '50%',
        top: '20%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        padding: '14px 22px',
        background: 'rgba(20, 18, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px dashed #C8A85060',
        borderRadius: '6px',
        maxWidth: '440px',
        pointerEvents: 'none',
      }}
    >
      {/* 水墨晕染底 */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, borderRadius: '6px',
        background: 'radial-gradient(ellipse at center, rgba(200,168,80,0.08) 0%, transparent 70%)',
        filter: 'blur(10px)', pointerEvents: 'none', zIndex: -1,
      }} />

      {isResultDone ? (
        // 完成态：✓ + summary（1 秒后由父组件切换状态触发淡出）
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            style={{ color: '#80C8A8', fontSize: '14px' }}
          >✓</motion.span>
          <span style={{
            color: '#C8A878', fontSize: '12px',
            fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.08em',
          }}>
            {lastResult.summary}
          </span>
        </motion.div>
      ) : (
        // 调用中：emoji + 文案 + 不确定进度条
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{ fontSize: '16px' }}
            >
              {currentTool ? getToolEmoji(currentTool) : '🔧'}
            </motion.span>
            <span style={{
              color: '#C8A878', fontSize: '12px',
              fontFamily: '"Noto Serif SC", serif', letterSpacing: '0.12em',
            }}>
              {currentTool ? `调用${getToolName(currentTool)}工具中…` : '正在调取外部数据…'}
            </span>
          </div>
          {/* 水墨风不确定进度条 */}
          <div style={{
            width: '180px', height: '2px',
            background: 'rgba(200,168,80,0.15)', borderRadius: '1px',
            overflow: 'hidden', position: 'relative',
          }}>
            <motion.div
              animate={{ x: ['-60px', '180px'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '60px', height: '100%',
                background: 'linear-gradient(90deg, transparent, #C8A850, transparent)',
              }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ============================================================
   Step 4.2: 发言底部工具结果脚注
   - 小字号(10px)、灰阶色(#9A9488)、斜体
   - 点击可展开完整工具结果（JSON）
============================================================ */
function ToolFootnote({ results }) {
  const [expanded, setExpanded] = useState(false);
  if (!results || results.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{
        marginTop: '10px',
        paddingTop: '8px',
        borderTop: '1px dotted #3A3530',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(prev => !prev)}
      title={expanded ? '点击收起' : '点击展开完整结果'}
    >
      {results.map((r, i) => (
        <div key={i} style={{
          fontSize: '10px',
          color: '#9A9488',
          fontFamily: '"Noto Serif SC", serif',
          fontStyle: 'italic',
          letterSpacing: '0.05em',
          lineHeight: 1.5,
          textAlign: 'center',
        }}>
          {getToolEmoji(r.tool)} {r.summary}
          {r.status === 'failed' && <span style={{ color: '#E88080', marginLeft: '4px' }}>·失败</span>}
        </div>
      ))}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              marginTop: '4px',
              padding: '6px 8px',
              background: 'rgba(40,35,30,0.4)',
              borderRadius: '3px',
              fontSize: '10px',
              color: '#6A6560',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
              maxHeight: '160px',
              overflowY: 'auto',
            }}
          >
            {JSON.stringify(results, null, 2)}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ============================================================
   打字机效果 - 字符逐字显示
   Step 6: 支持 <mention> 标签渲染（朱砂红下划线 + tooltip）
============================================================ */
function TypewriterText({ text, agentColor, agents, onDone }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  // 缓存 onDone 回调，避免它变化时触发 effect 重跑（保护打字机不被重渲染打断）
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Step 6: 预处理 <mention> XML 标签 → 可见短文本 `内容 →@风眼`
  // 不破坏打字机效果，渲染时再高亮 →@风眼 部分
  const processedText = useMemo(
    () => preprocessMentionsInText(text, agents),
    [text, agents]
  );

  // 重新开始
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    startTimeRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [processedText]);

  useEffect(() => {
    const speed = 70; // ms per char
    const total = processedText.length;
    let mounted = true;

    const tick = (now) => {
      if (!mounted) return;
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const charsToShow = Math.min(total, Math.floor(elapsed / speed));
      setDisplayed(processedText.slice(0, charsToShow));
      if (charsToShow < total) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [processedText]);

  // Step 4: 打字完成后通知父组件（触发工具结果脚注显示）
  useEffect(() => {
    if (done && onDoneRef.current) onDoneRef.current();
  }, [done]);

  return (
    <div
      style={{
        textAlign: 'center',
        fontSize: '15px',
        color: '#F0EDE5',
        fontFamily: '"Noto Serif SC", serif',
        lineHeight: 2.2,
        letterSpacing: '0.08em',
        textShadow: '0 0 8px rgba(0,0,0,0.7), 0 1px 2px rgba(0,0,0,0.5)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'normal',
        overflowWrap: 'break-word',
        padding: '0 12px',
        minHeight: '4.4em',
      }}
    >
      {renderTextWithMentions(displayed, agents)}
      {!done && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            display: 'inline-block',
            width: '2px',
            height: '1em',
            background: agentColor.glow,
            marginLeft: '2px',
            verticalAlign: '-2px',
            boxShadow: `0 0 6px ${agentColor.glow}`,
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   演的思考过程可视化 - 零预设，只读 inference 真实字段
   4 步：读问题 → 召回记忆 → 匹配智囊 → 预判分歧
   ★ 不再用 detectQuestionType()/getAgentsForQuestion()/divergenceMap 三个硬编码预设
   ★ 若 inference 尚未返回（PLAN → WAIT/EXECUTE 之间），则只显示"正在起卦，演·析问中…"
============================================================ */
function YanThinkingSteps({ question, inference, candidateAgents }) {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState([false, false, false, false]);

  const analysis = useMemo(() => {
    const q = question || '';
    const numbers = (q.match(/\d+(?:万|k|K|w|W|岁|年|个月|块|%|元)?/g) || []).slice(0, 3);
    const stopWords = ['要不要', '该不该', '是不是', '怎么样', '怎么办', '的话', '如果', '现在', '觉得', '感觉', '应该', '可以', '可能', '还是', '或者', '但是', '我想', '我要', '我打算', '我们'];
    const keywords = (q.match(/[\u4e00-\u9fa5]{2,6}/g) || [])
      .filter(w => !stopWords.includes(w))
      .slice(0, 4);

    // ★ 关键：分类、智囊、分歧 全部优先读 inference 里 plan 返回的真实字段（来自后端 Orchestrator Agent）
    //   - 只有在 inference 还没回来的 0~2s 初始空窗期，才给一个"演·析问中…"占位文案（不展示任何预设标签）
    const plan = inference && inference.plan ? inference.plan : null;
    const infType = inference && inference.questionType ? inference.questionType : null;
    const questionTypeLabel = infType
      ? (typeof infType === 'string' ? infType : (infType.label || infType.name || '人生抉择'))
      : null; // null = 不展示分类标签，避免预设泄露

    // 1) 记忆：优先读 inference.memory，否则 recallRelevantMemories 本地兜底
    let memories = [];
    if (Array.isArray(inference && inference.memory) && inference.memory.length > 0) {
      memories = inference.memory.slice(0, 3);
    } else {
      try { memories = recallRelevantMemories(q, 3); } catch (e) { /* ignore */ }
    }
    const memoryHint = memories.length > 0
      ? memories
        .map(m => {
          const c = (m.content || m.text || '').slice(0, 16);
          if (!c) return null;
          const tag = ({ working: '近期', fact: '已知', episode: '曾历', profile: '命格', preference: '偏好', concern: '红线' }[m.type]) || '前忆';
          return `${tag}·${c}`;
        })
        .filter(Boolean)
      : ['无相关前忆，此为首问'];

    // 2) 智囊：优先读 inference.perspectivePool / inference.agents，否则读传入的 candidateAgents（都没有就不展示"召 XX·XX"）
    let matchedNames = [];
    if (Array.isArray(inference && inference.perspectivePool) && inference.perspectivePool.length > 0) {
      matchedNames = inference.perspectivePool.slice(0, 4).map(a => a.name || a.perspective || a.id);
    } else if (Array.isArray(plan && plan.agents) && plan.agents.length > 0) {
      matchedNames = plan.agents.slice(0, 4).map(a => a.name || a.id);
    } else if (Array.isArray(candidateAgents) && candidateAgents.length > 0) {
      matchedNames = candidateAgents.slice(0, 4).map(a => a.name || a.perspective || a.id);
    }

    // 3) 分歧：优先读 plan.divergence / inference.divergence（后端 Orchestrator 产出），否则不做预设，只显示"判论·察势中…"
    let divergence = null;
    if (plan && plan.divergence) divergence = plan.divergence;
    else if (inference && inference.divergence) divergence = inference.divergence;

    return {
      numbers, keywords,
      questionTypeLabel,      // null = 不展示标签（防止硬编码预设）
      memoryHint,
      agentNames: matchedNames,
      divergence,
      planReady: !!(inference && (plan || inference.state || inference.sessionId)),
    };
  }, [question, inference, candidateAgents]);

  useEffect(() => {
    setActive(0);
    // E1 Fix: done 数组长度不写死 4，永远跟 steps.length 对齐
    // 之前写死 4 会导致 steps 数量变化时数组长度变，报「changed size between renders」
    const len = steps.length;
    setDone(new Array(len).fill(false));
    const timers = [];
    // 只初始化 len 个定时器，每个对应 1 step，不再写死 4 个
    for (let i = 0; i < len; i++) {
      timers.push(setTimeout(() => {
        setActive(i + 1);
        setDone(d => {
          const arr = Array.isArray(d) ? [...d] : new Array(len).fill(false);
          for (let j = 0; j <= i && j < len; j++) arr[j] = true;
          return arr;
        });
      }, 1100 * (i + 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [question, steps.length]);

  // 4 步文案：只有在 inference 真实字段有值的情况下才显示右侧"·结果"
  const stepHint = (label, fallbackIfNotReady, valueIfReady) => {
    if (valueIfReady != null && String(valueIfReady).length > 0) return valueIfReady;
    if (!analysis.planReady) return fallbackIfNotReady;
    if (label === '匹配智囊' && analysis.agentNames.length === 0) return '候选视角池已就绪';
    if (label === '预判分歧' && analysis.divergence == null) return '势·未分';
    return fallbackIfNotReady;
  };

  const steps = [
    {
      label: '读问题',
      hint: analysis.numbers.length > 0
        ? `提得数字 ${analysis.numbers.join('·')}`
        : (analysis.keywords.length > 0 ? `抓得关键 ${analysis.keywords.slice(0, 2).join('·')}` : stepHint('读问题', '演·审字读意中…', analysis.planReady ? '此问需详推' : '演·审字读意中…'))
    },
    { label: '召回记忆', hint: stepHint('召回记忆', '演·察命格中…', analysis.memoryHint[0]) },
    { label: '匹配智囊', hint: stepHint('匹配智囊', '演·起视角池中…', analysis.agentNames.length > 0 ? `候选视角 ${analysis.agentNames.slice(0, 2).join('·')}…` : null) },
    { label: '预判分歧', hint: stepHint('预判分歧', '演·判势中…', analysis.divergence) },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px' }}>
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        style={{ fontSize: '16px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif', letterSpacing: '0.25em', textShadow: '0 0 12px #F0D89055' }}
      >
        演 · 正在思索
      </motion.div>

      {/* ★ 问题类型标签：只有 inference 回来且显式有 questionType 才显示；否则完全不显示（防止 QUESTION_TYPE_RULES 硬编码预设泄露）*/}
      <AnimatePresence>
        {analysis.questionTypeLabel && (
          <motion.div
            key="typeLabel"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontSize: '11px', color: '#A89888', fontFamily: '"Noto Serif SC", serif',
              letterSpacing: '0.3em', padding: '2px 12px',
              border: '1px solid #3A3530', borderRadius: '2px',
            }}
          >
            {analysis.questionTypeLabel}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 步骤流 - 竖向，每步带结果摘要 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
        {steps.map((s, i) => {
          const isActive = i === active && !done[i];
          const isDone = done[i];
          const isPending = !isDone && !isActive;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: isPending ? 0.32 : 1, x: 0 }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
            >
              <motion.span
                animate={{
                  background: isDone ? '#80C8A8' : (isActive ? '#F0D890' : '#3A3530'),
                  boxShadow: isActive ? '0 0 10px #F0D890' : (isDone ? '0 0 6px #80C8A8' : 'none'),
                  scale: isActive ? [1, 1.2, 1] : 1,
                }}
                transition={{ duration: isActive ? 1.1 : 0.5, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
                style={{ width: '7px', height: '7px', borderRadius: '50%' }}
              />
              <span style={{
                fontSize: '13px',
                color: isDone ? '#80C8A8' : (isActive ? '#F0D890' : '#6A6560'),
                fontFamily: '"Ma Shan Zheng", "ZCOOL XiaoWei", "Noto Serif SC", "PingFang SC", serif',
                letterSpacing: '0.15em',
                minWidth: '52px',
              }}>
                {s.label}
              </span>
              <AnimatePresence>
                {(isDone || isActive) && s.hint && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      fontSize: '11px',
                      color: isDone ? '#888' : '#C8A878',
                      fontFamily: '"Noto Serif SC", serif',
                      letterSpacing: '0.08em',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '240px',
                    }}
                  >
                    {s.hint}
                  </motion.span>
                )}
              </AnimatePresence>
              {isDone && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  style={{ color: '#80C8A8', fontSize: '11px' }}
                >
                  ✓
                </motion.span>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
