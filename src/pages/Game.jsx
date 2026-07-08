import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
// 注: TopBar/BottomBar 已移除 — Game.jsx 用本地 phase 状态, 与 GameContext 脱节
// 阶段提示由内置 ProcessStepper + phaseLabel 提供, 重置由内部按钮处理
import Board from '../components/board/GameBoard';
import ChoiceHud from '../components/board/ChoiceHud';
import AgentDialogueOverlay from '../components/board/AgentDialogueOverlay';
import ProcessStepper from '../components/board/ProcessStepper';
import { getAgentsForQuestion, detectQuestionType, QUESTION_TYPES } from '../data/agents';
import { COLORS } from '../components/board/layoutConfig';
import { generateInferenceContent } from '../services/inferenceEngine';

const BORDER_COLOR = '#C8A850';
const GLOW_COLOR = '#F0D890';
const RUST_COLOR = '#A8472E';
const PAPER_COLOR = '#FAF6EC';
const DEFAULT_CHOICES = [
  { id: 'opportunity', label: '抓住机会', color: COLORS.choice.opportunity, glowColor: '#E8B880', icon: '☰', gua: '大有' },
  { id: 'risk', label: '规避风险', color: COLORS.choice.risk, glowColor: '#E88080', icon: '☵', gua: '坎' },
  { id: 'stable', label: '稳守当前', color: COLORS.choice.stable, glowColor: '#80C8A8', icon: '☶', gua: '艮' },
  { id: 'explore', label: '探索新路', color: COLORS.choice.explore, glowColor: '#D8A8C8', icon: '☴', gua: '巽' },
];

export default function Game() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('input');
  const [userInput, setUserInput] = useState('');
  const [inputValue, setInputValue] = useState('要不要接那个新 Offer?');
  const [inference, setInference] = useState(null);
  const [showInput, setShowInput] = useState(true);
  const [showQuestion, setShowQuestion] = useState(false);
  const [activeAgentIdx, setActiveAgentIdx] = useState(-1);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [agentDialogues, setAgentDialogues] = useState({ history: {} });
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  // 用户推进控制 - 是否等待用户点击"继续"
  const [awaitingUser, setAwaitingUser] = useState(false);
  // 用户对当前 Agent 的回应(可空)
  const [currentResponse, setCurrentResponse] = useState('');
  // 用户在 committing 阶段写下的一句承诺
  const [currentCommit, setCurrentCommit] = useState('');
  // oracle 阶段: 投三枚铜钱立卦
  const [oracleThrowing, setOracleThrowing] = useState(false);
  const [oracleResult, setOracleResult] = useState(null);
  // 浮动提示 (替代 alert)
  const [floatTip, setFloatTip] = useState(null);
  const floatTipTimer = useRef(null);
  const stageTimersRef = useRef([]);

  const activeAgents = useMemo(() => {
    if (!userInput) return [];
    return getAgentsForQuestion(userInput);
  }, [userInput]);

  const questionType = useMemo(() => {
    if (!userInput) return null;
    const type = detectQuestionType(userInput);
    return QUESTION_TYPES[type];
  }, [userInput]);

  const choices = useMemo(() => {
    if (activeAgents.length <= 2) return DEFAULT_CHOICES.slice(0, 3);
    if (activeAgents.length >= 5) return DEFAULT_CHOICES;
    return DEFAULT_CHOICES.slice(0, 3);
  }, [activeAgents.length]);

  const clearTimers = useCallback(() => {
    stageTimersRef.current.forEach(t => clearTimeout(t));
    stageTimersRef.current = [];
    if (floatTipTimer.current) { clearTimeout(floatTipTimer.current); floatTipTimer.current = null; }
  }, []);

  const handleStart = useCallback(async () => {
    if (!inputValue.trim()) return;
    const question = inputValue.trim();
    setUserInput(question);
    setShowInput(false);
    setShowQuestion(true);
    setPhase('casting');
    setActiveAgentIdx(-1);
    setSelectedChoice(null);
    setAgentDialogues({ history: {} });
    setAwaitingUser(false);
    setCurrentResponse('');

    // 预生成内容 - 真实 LLM / 本地智能预设
    const inf = await generateInferenceContent(question);
    setInference(inf);
    const agents = inf.agents;
    const dialogues = inf.agentDialogues;
    const llmSummary = inf.summary;

    clearTimers();
    const timers = [];

    // ============== 加长流程节奏 ==============
    // 1) 投币起卦 (4s) - CoinRitual 视觉, 三枚铜钱翻飞
    // 2) 演 · 理解 (3s) - 抽取问题的关键
    // 3) 召唤智囊 (2.5s) - CompassNeedle 罗盘指向
    // 4) 第一轮发言 (用户点继续) - 各位 Agent 表明立场
    // 5) 演 · 反思 (3.5s) - 看到不同意见汇聚
    // 6) 演 · 总结 - 给出总判断
    // 7) 决心 (1.5s, 用户写一句承诺)
    // 8) 抉择 - 4 个分岔
    // 9) 路径推演 (4.5s) - 演 说出选择后的演绎
    // 10) 揭示命签 - 进入 final

    timers.push(setTimeout(() => {
      setPhase('analyzing');
    }, 4000));

    timers.push(setTimeout(() => {
      setPhase('summoning');
    }, 7000));

    timers.push(setTimeout(() => {
      setPhase('agent_debate');
      setActiveAgentIdx(0);
      const dialogue = dialogues[agents[0].id] || '...';
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        // 去重: 如果这段话已在历史中, 跳过
        const existing = history[agents[0].id] || [];
        if (existing.includes(dialogue)) {
          return prev;
        }
        history[agents[0].id] = [...existing, dialogue];
        return { ...prev, [agents[0].id]: dialogue, history };
      });
      setAwaitingUser(true);
    }, 9500));

    stageTimersRef.current = timers;
  }, [inputValue, clearTimers]);

  // 用户点击"继续" - 推进到下一位 Agent 或下一阶段
  const handleUserAdvance = useCallback(() => {
    if (!inference) return;
    const agents = inference.agents;
    const dialogues = inference.agentDialogues;
    const currentIdx = activeAgentIdx;

    // 保存用户对当前 Agent 的回应(如有)
    if (currentResponse.trim() && currentIdx >= 0) {
      const agentId = agents[currentIdx].id;
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        const arr = history[agentId] || [];
        history[agentId] = [...arr, `【你】${currentResponse.trim()}`];
        return { ...prev, [agentId]: `【你】${currentResponse.trim()}`, history };
      });
      setCurrentResponse('');
    }

    setAwaitingUser(false);

    // 还有下一位 Agent -> 切换到下一位
    if (currentIdx < agents.length - 1) {
      const nextIdx = currentIdx + 1;
      const t = setTimeout(() => {
        setActiveAgentIdx(nextIdx);
        const dialogue = dialogues[agents[nextIdx].id] || '...';
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          // 去重: 不重复添加同一段话
          const existing = history[agents[nextIdx].id] || [];
          if (existing.includes(dialogue)) {
            return prev;
          }
          history[agents[nextIdx].id] = [...existing, dialogue];
          return { ...prev, [agents[nextIdx].id]: dialogue, history };
        });
        setAwaitingUser(true);
      }, 800);
      stageTimersRef.current.push(t);
    } else {
      // 所有 Agent 发言完毕 -> 演 反思汇聚 (3.5s) -> 演 总结
      const t1 = setTimeout(() => {
        setPhase('reflecting');
        setActiveAgentIdx(-1);
        setShowQuestion(false);
        // 演 在反思阶段先抛出一段总览(各 Agent 立场汇聚)
        const reflectingText = `诸位所议,皆有道理。\n钱谷重账目,路向重节奏,风眼重险隘,心禾重本心,镜渊重自省,云图重远方。\n听罢,让我再思量一卦……`;
        setAgentDialogues(prev => ({
          ...prev,
          yan: reflectingText,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingText] },
        }));
        setAwaitingUser(false); // 反思阶段不需用户点
      }, 800);
      const t2 = setTimeout(() => {
        setPhase('summary');
        setAgentDialogues(prev => ({
          ...prev,
          yan: inference.summary,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), inference.summary] },
        }));
        setAwaitingUser(true);
      }, 4300); // 3.5s 反思 + 800ms 缓冲
      stageTimersRef.current.push(t1, t2);
    }
  }, [activeAgentIdx, inference, currentResponse]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const handleChoiceClick = useCallback((choice, index) => {
    setSelectedChoice(choice);
    setPhase('path_reveal');
    setAwaitingUser(false);

    // path_reveal 阶段演 的总结 - 优先用 inference 真实数据
    setAgentDialogues(prev => {
      // 从 inference 中取出该选择对应的推演成果
      const realGua = inference?.gua;
      const realVerse = inference?.verse;
      const summary = realGua
        ? `诸位所见,皆因视角不同。\n卦成${realGua.gua}（${realGua.element}行）,辞曰「${realVerse || '此中深意,待你细品'}」。\n择「${choice.label}」之路,是你的本心所向,亦是天命所归。\n往后的路,且行且思。`
        : `诸位所见,皆因视角不同。\n择「${choice.label}」之路,是你的本心所向,亦是当下最合适的回响。\n卦已成,辞已立,往后路如何,且行且思。`;
      return {
        ...prev,
        yan: summary,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), summary] },
      };
    });

    // 4.5s 后等用户点"揭示命签"
    const t = setTimeout(() => {
      setAwaitingUser(true);
    }, 4500);
    stageTimersRef.current.push(t);
  }, [inference]);

  // 用户点击"揭示命签" - 从 path_reveal 进入 final
  const handleRevealFate = useCallback(() => {
    setAwaitingUser(false);
    setPhase('final');
  }, []);

  // 总结 -> 决心 -> 抉择: 用户点"看分岔" -> 决心 -> 写承诺 -> oracle_prompt
  const handleShowChoices = useCallback(() => {
    setPhase('committing');
    setAwaitingUser(false);
    setAgentDialogues(prev => {
      const reflectingAck = '卦已成,辞已立。\n在分岔之前,请落笔一句你的本心所向。\n不拘长短,只为后日回看。';
      return {
        ...prev,
        yan: reflectingAck,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingAck] },
      };
    });
  }, []);

  // 决心 -> oracle_prompt
  const handleCommit = useCallback(() => {
    if (currentCommit.trim()) {
      setAgentDialogues(prev => ({
        ...prev,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), `【你 · 决】${currentCommit.trim()}`] },
      }));
      setCurrentCommit('');
    }
    setPhase('oracle_prompt');
    setAgentDialogues(prev => {
      const oracleAsk = '分岔在前,诸路尚未分明。\n——「需为这一卦再投三枚铜钱,借一束天光吗？」\n也许一卦之后,你自然开解。';
      return {
        ...prev,
        yan: oracleAsk,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), oracleAsk] },
      };
    });
  }, [currentCommit]);

  // 算一卦
  const handleStartOracle = useCallback(() => {
    setPhase('oracle');
    setOracleThrowing(true);
    setOracleResult(null);
    setAwaitingUser(false);
    setTimeout(() => {
      const ORACLE_GUAS = [
        { gua: '乾', trigram: '☰', element: '天', verse: '元亨。利贞。', gloss: '天行健, 君子以自强不息。' },
        { gua: '坤', trigram: '☷', element: '地', verse: '元亨。利牝马之贞。', gloss: '地势坤, 君子以厚德载物。' },
        { gua: '震', trigram: '☳', element: '雷', verse: '亨。震来虩虩, 笑言哑哑。', gloss: '洊雷, 君子以恐惧修省。' },
        { gua: '巽', trigram: '☴', element: '风', verse: '小亨。利有攸往。利见大人。', gloss: '随风, 君子以申命行事。' },
        { gua: '坎', trigram: '☵', element: '水', verse: '习坎, 有孚, 维心亨。', gloss: '习坎, 行有尚。险中可通。' },
        { gua: '离', trigram: '☲', element: '火', verse: '利贞。亨。畜牝牛, 吉。', gloss: '明两作, 大人以继明照四方。' },
        { gua: '艮', trigram: '☶', element: '山', verse: '艮其背, 不获其身。', gloss: '兼山, 止其所也。静观其变。' },
        { gua: '兑', trigram: '☱', element: '泽', verse: '亨。利贞。', gloss: '丽泽, 君子以朋友讲习。' },
      ];
      const r = ORACLE_GUAS[Math.floor(Math.random() * ORACLE_GUAS.length)];
      setOracleResult(r);
      setOracleThrowing(false);
      setInference(prev => ({ ...(prev || {}), gua: { gua: r.gua, trigram: r.trigram, element: r.element }, verse: r.verse, oracleGloss: r.gloss }));
      setAgentDialogues(prev => {
        const oracleResp = `此卦${r.gua}（${r.trigram}·属${r.element}）。\n${r.verse}\n——${r.gloss}\n请将此天光带入分岔。`;
        return {
          ...prev,
          yan: oracleResp,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), oracleResp] },
        };
      });
    }, 1800);
  }, []);

  // 算完,继续到分岔
  const handleProceedToChoices = useCallback(() => {
    setPhase('branch_select');
  }, []);

  // 跳过占卜,直接看分岔
  const handleSkipOracle = useCallback(() => {
    setPhase('branch_select');
    setAgentDialogues(prev => {
      const skipMsg = '「也罢。心已明, 便不必再劳烦天机。分岔就在眼前。」';
      return {
        ...prev,
        yan: skipMsg,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), skipMsg] },
      };
    });
  }, []);

  const handleAgentClick = useCallback((agent) => {
    setShowHistoryPanel(true);
  }, []);

  const handleRestart = useCallback(() => {
    clearTimers();
    setPhase('input');
    setShowInput(true);
    setShowQuestion(false);
    setUserInput('');
    setActiveAgentIdx(-1);
    setSelectedChoice(null);
    setAgentDialogues({ history: {} });
    setShowHistoryPanel(false);
    setAwaitingUser(false);
    setCurrentResponse('');
    setInference(null);
  }, [clearTimers]);

  // 保存到卡牌册 - 用 inference 真实数据,3 件实用品随卡入册
  const handleSaveToCollection = useCallback(() => {
    try {
      // 兜底卦象映射
      const fallbackMap = {
        opportunity: { gua: '大有', trigram: '☰', verse: '元亨。柔得尊位,大亨以正。', element: '火', style: '机会型' },
        risk:        { gua: '坎',  trigram: '☵', verse: '习坎,有孚,维心亨。', element: '水', style: '稳健型' },
        stable:      { gua: '艮',  trigram: '☶', verse: '艮其背,不获其身。', element: '山', style: '稳健型' },
        explore:     { gua: '巽',  trigram: '☴', verse: '小亨,利有攸往。', element: '风', style: '机会型' },
      };
      const fb = fallbackMap[selectedChoice?.id] || fallbackMap.opportunity;
      // 优先使用 inference 生成的真实数据
      const realGua = inference?.gua;
      const card = {
        id: `card-${Date.now()}`,
        gua: realGua?.gua || fb.gua,
        trigram: realGua?.trigram || fb.trigram,
        element: realGua?.element || fb.element,
        title: selectedChoice?.label || '推演',
        question: userInput,
        decision: selectedChoice?.label || '抓住机会',
        style: realGua?.element ? `${realGua.element}行` : fb.style,
        advisors: activeAgents.filter(a => a.role !== 'master').map(a => a.name),
        // 3 件实用品 - 推演成果随卡保存
        verse: inference?.verse || fb.verse,
        powerfulQuestion: inference?.powerfulQuestion || '',
        framework: inference?.framework || '',
        summary: inference?.summary || '此卦已入卡牌册,留作后日之镜。',
        // 卦象元素
        guaElement: realGua?.element || fb.element,
        // 时间
        date: new Date().toISOString().split('T')[0],
        pillars: (() => {
          const now = new Date();
          const stems = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
          const branches = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
          const pillar = (n) => stems[n % 10] + branches[n % 12];
          return {
            year: pillar(now.getFullYear() + 4),
            month: pillar(now.getMonth() + 1 + now.getFullYear()),
            day: pillar(now.getDate() + (now.getMonth() + 1) * 3),
            hour: pillar(now.getHours() + now.getDate() * 2),
          };
        })(),
        hasAchievement: false,
      };
      const saved = JSON.parse(localStorage.getItem('yance_collection') || '[]');
      saved.unshift(card);
      localStorage.setItem('yance_collection', JSON.stringify(saved));
      // 浮动提示替代 alert, 保持沉浸感
      setFloatTip(`命签「${card.gua} · ${card.title}」已入卡牌册`);
      if (floatTipTimer.current) clearTimeout(floatTipTimer.current);
      floatTipTimer.current = setTimeout(() => setFloatTip(null), 2400);
    } catch (e) {
      console.error('保存失败', e);
    }
  }, [selectedChoice, userInput, activeAgents, inference]);

  // 顶栏提示文字
  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'casting': return '演 · 起卦 · 投三枚铜钱';
      case 'analyzing': return '演 · 理解问题';
      case 'summoning': return `演 · 召唤顾问 · ${activeAgents.filter(a => a.role !== 'master').length} 位`;
      case 'agent_debate': return activeAgentIdx >= 0 ? `${activeAgents.filter(a => a.role !== 'master')[activeAgentIdx]?.name || ''} 发言中 · ${activeAgentIdx + 1}/${activeAgents.filter(a => a.role !== 'master').length}` : '诸智集结';
      case 'reflecting': return '演 · 反思汇聚';
      case 'summary': return '演 · 梳理总结';
      case 'committing': return '演 · 落笔本心';
      case 'oracle_prompt': return '演 · 借天光否';
      case 'oracle': return oracleThrowing ? '演 · 落卦中' : (oracleResult ? `演 · 天机已现 · ${oracleResult.gua}` : '演 · 借天光否');
      case 'branch_select': return '请选择你的路径';
      case 'path_reveal': return '路径已定';
      case 'final': return '推演完成';
      default: return '';
    }
  }, [phase, activeAgentIdx, activeAgents]);

  const historyCount = useMemo(() => {
    const h = agentDialogues?.history || {};
    return Object.values(h).reduce((sum, arr) => sum + arr.length, 0);
  }, [agentDialogues]);

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: '#1A1410' }}>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className="w-full h-full relative">
          <Board
            phase={phase}
            activeAgentIdx={activeAgentIdx}
            activeAgents={activeAgents}
            agentDialogues={agentDialogues}
            onAgentClick={handleAgentClick}
            userInput={userInput}
            showQuestion={showQuestion}
            selectedChoice={selectedChoice}
            inference={inference}
          />
        </div>

        {/* 流程指示器 - 顶部居中 */}
        <ProcessStepper phase={phase} />

        {/* 阶段提示 - 流程指示器下方（活动 Agent 名） */}
        <AnimatePresence>
          {phaseLabel && !showInput && phase === 'agent_debate' && activeAgentIdx >= 0 && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20"
              style={{ top: '92px' }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div style={{
                padding: '4px 14px',
                background: 'rgba(8,8,12,0.7)',
                backdropFilter: 'blur(8px)',
                color: GLOW_COLOR,
                fontSize: '10px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.25em',
                border: `1px solid ${BORDER_COLOR}40`,
              }}>
                {phaseLabel}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* casting 投币提示 */}
        <AnimatePresence>
          {phase === 'casting' && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ marginTop: '120px' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div style={{
                color: GLOW_COLOR,
                fontSize: '12px',
                fontFamily: '"Ma Shan Zheng", serif',
                letterSpacing: '0.3em',
                textShadow: `0 0 10px ${GLOW_COLOR}`,
                opacity: 0.85,
              }}>
                投三枚铜钱,立此一卦……
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* reflecting 反思提示 */}
        <AnimatePresence>
          {phase === 'reflecting' && (
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              style={{ marginTop: '120px' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div style={{
                color: GLOW_COLOR,
                fontSize: '11px',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.3em',
                textShadow: `0 0 8px ${GLOW_COLOR}`,
                opacity: 0.8,
              }}>
                演 · 反思汇聚中……
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agent 对话 - 无框浮动文字 */}
        <AgentDialogueOverlay
          phase={phase}
          activeAgentIdx={activeAgentIdx}
          activeAgents={activeAgents}
          agentDialogues={agentDialogues}
        />

        {/* 选择项 HUD - 浮在屏幕下方 */}
        <ChoiceHud
          phase={phase}
          choices={choices}
          onClick={handleChoiceClick}
          selectedChoice={selectedChoice}
        />

        {/* 历史对话收起按钮 - 右上角 */}
        {historyCount > 0 && !showHistoryPanel && (
          <motion.div
            className="absolute top-4 right-4 z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <button
              onClick={() => setShowHistoryPanel(true)}
              style={{
                padding: '5px 12px',
                background: 'rgba(8,8,12,0.7)',
                backdropFilter: 'blur(8px)',
                color: GLOW_COLOR,
                fontSize: '10px',
                fontFamily: '"Noto Serif SC", serif',
                border: `1px solid ${BORDER_COLOR}50`,
                letterSpacing: '0.1em',
                cursor: 'pointer',
              }}
            >
              推演记录 ({historyCount})
            </button>
          </motion.div>
        )}

        {/* 历史对话侧边栏 */}
        <AnimatePresence>
          {showHistoryPanel && (
            <motion.div
              className="absolute top-0 right-0 h-full w-[280px] z-30"
              initial={{ x: 280, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 280, opacity: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                background: 'rgba(8,8,12,0.95)',
                backdropFilter: 'blur(16px)',
                borderLeft: `1px solid ${BORDER_COLOR}40`,
              }}
            >
              <div className="p-5 h-full flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <span style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', fontSize: '14px', letterSpacing: '0.15em' }}>
                    推演记录
                  </span>
                  <button
                    onClick={() => setShowHistoryPanel(false)}
                    style={{ color: '#807870', fontSize: '16px', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >×</button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {activeAgents.filter(a => a.role !== 'master').map(agent => {
                    const msgs = agentDialogues?.history?.[agent.id] || [];
                    if (msgs.length === 0) return null;
                    const agentColor = COLORS.agent[agent.id] || { main: '#C8A850', glow: '#F0D890' };
                    return (
                      <div key={agent.id} className="mb-4">
                        <div style={{
                          fontSize: '10px',
                          color: agentColor.glow,
                          fontFamily: '"Ma Shan Zheng", serif',
                          letterSpacing: '0.2em',
                          marginBottom: '4px',
                          textShadow: `0 0 6px ${agentColor.glow}80`,
                        }}>
                          {agent.name} · {agent.stance}
                        </div>
                        {msgs.map((msg, i) => (
                          <div key={i} style={{
                            fontSize: '11px',
                            color: '#E0DDD5',
                            fontFamily: '"Noto Serif SC", serif',
                            lineHeight: 1.8,
                            padding: '6px 10px',
                            borderLeft: `2px solid ${agentColor.glow}80`,
                            marginBottom: '6px',
                            background: 'rgba(255,255,255,0.03)',
                          }}>
                            {msg}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {selectedChoice && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BORDER_COLOR}40` }}>
                      <div style={{
                        fontSize: '10px',
                        color: GLOW_COLOR,
                        fontFamily: '"Ma Shan Zheng", serif',
                        letterSpacing: '0.2em',
                        marginBottom: '4px',
                      }}>
                        最终选择
                      </div>
                      <div style={{
                        fontSize: '13px',
                        color: '#FFF8E8',
                        fontFamily: '"Ma Shan Zheng", serif',
                        textShadow: `0 0 8px ${GLOW_COLOR}`,
                      }}>
                        {selectedChoice.label}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 用户推进控制 - agent_debate 和 summary 阶段 */}
        <AnimatePresence>
          {awaitingUser && (phase === 'agent_debate' || phase === 'summary') && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {/* 用户回应输入(可空,直接点继续则不记录) */}
              {phase === 'agent_debate' && (
                <div className="w-full mb-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value.slice(0, 80))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleUserAdvance();
                      }
                    }}
                    placeholder="可以补充信息,也可留空直接翻牌"
                    maxLength={80}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: 'rgba(8,8,12,0.7)',
                      backdropFilter: 'blur(8px)',
                      color: '#F0EBDD',
                      fontSize: '11px',
                      fontFamily: '"Noto Serif SC", serif',
                      border: `1px solid ${BORDER_COLOR}40`,
                      outline: 'none',
                      letterSpacing: '0.05em',
                    }}
                  />
                </div>
              )}

              {/* 继续按钮 */}
              <button
                onClick={phase === 'summary' ? handleShowChoices : handleUserAdvance}
                style={{
                  padding: '12px 36px',
                  background: 'rgba(8,8,12,0.85)',
                  backdropFilter: 'blur(10px)',
                  color: GLOW_COLOR,
                  fontSize: '13px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: `1px solid ${BORDER_COLOR}`,
                  cursor: 'pointer',
                  boxShadow: `0 0 24px ${GLOW_COLOR}40`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 32px ${GLOW_COLOR}80`;
                  e.currentTarget.style.background = 'rgba(8,8,12,0.95)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 24px ${GLOW_COLOR}40`;
                  e.currentTarget.style.background = 'rgba(8,8,12,0.85)';
                }}
              >
                {phase === 'summary' ? '看分岔 · 抉择' : (activeAgentIdx < activeAgents.filter(a => a.role !== 'master').length - 1 ? '下一位发言' : '请演总结')}
                <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 揭示命签 - path_reveal 阶段 */}
        <AnimatePresence>
          {awaitingUser && phase === 'path_reveal' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20"
              style={{ bottom: '24px' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <button
                onClick={handleRevealFate}
                style={{
                  padding: '14px 42px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.4em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: `0 0 32px ${GLOW_COLOR}80`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 48px ${GLOW_COLOR}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 32px ${GLOW_COLOR}80`;
                }}
              >
                揭 示 命 签
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* oracle_prompt - 借天光否 */}
        <AnimatePresence>
          {phase === 'oracle_prompt' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
              style={{ bottom: '32px' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <div style={{ display: 'flex', gap: 14 }}>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleStartOracle}
                  className="px-6 py-3 text-[14px]"
                  style={{
                    background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                    color: '#0E0A06',
                    fontFamily: '"Ma Shan Zheng", serif',
                    fontWeight: 600,
                    letterSpacing: '0.3em',
                    border: 'none',
                    borderRadius: 2,
                    cursor: 'pointer',
                    boxShadow: `0 0 24px ${GLOW_COLOR}60`,
                    transition: 'all 0.3s ease',
                  }}
                >
                  投 三 枚 铜 钱
                </motion.button>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleSkipOracle}
                  className="px-6 py-3 text-[13px]"
                  style={{
                    backgroundColor: 'transparent',
                    color: GLOW_COLOR,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: `1px solid ${BORDER_COLOR}`,
                    borderRadius: 2,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                  }}
                >
                  已 然 明 朗
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* oracle - 投币立卦 */}
        <AnimatePresence>
          {phase === 'oracle' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ top: 'calc(50% + 200px)' }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              {!oracleResult ? (
                // 投币中
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={oracleThrowing ? {
                        rotateY: [0, 1260],
                        y: [0, -22, 0],
                        scale: [1, 1.12, 1],
                      } : { rotateY: 0, y: 0, scale: 1 }}
                      transition={{
                        duration: 1.2,
                        ease: 'easeInOut',
                        delay: i * 0.15,
                      }}
                      style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: `
                          radial-gradient(circle at 28% 22%, #F5E6C8 0%, #E8D098 30%, #C49A5C 65%, #8A6A30 100%)
                        `,
                        border: '2px solid #6B4A1F',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#3A2810',
                        fontFamily: '"Ma Shan Zheng", serif',
                        fontSize: 18,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.35), 0 0 12px rgba(200, 168, 80, 0.35), inset 0 2px 6px rgba(255, 240, 200, 0.4), inset 0 -2px 6px rgba(90, 58, 26, 0.3)',
                        position: 'relative',
                      }}
                    >
                      <div style={{
                        position: 'absolute',
                        width: 12, height: 12,
                        background: '#A8472E',
                        boxShadow: '0 0 6px rgba(168, 71, 46, 0.6), inset 0 1px 2px rgba(0,0,0,0.3)',
                      }} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                // 落卦结果 + 继续
                <motion.div
                  key="result"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                  className="flex flex-col items-center gap-3"
                >
                  <div
                    className="px-5 py-3 flex items-center gap-3"
                    style={{
                      background: `linear-gradient(135deg, ${RUST_COLOR} 0%, #8A3925 100%)`,
                      color: PAPER_COLOR,
                      borderRadius: 2,
                      boxShadow: `0 4px 24px ${RUST_COLOR}80`,
                    }}
                  >
                    <span style={{ fontSize: 24, fontFamily: '"Ma Shan Zheng", serif' }}>{oracleResult.trigram}</span>
                    <div className="flex flex-col">
                      <span style={{ fontSize: 16, fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em' }}>{oracleResult.gua}</span>
                      <span style={{ fontSize: 10, opacity: 0.85, letterSpacing: '0.15em' }}>五行属 {oracleResult.element}</span>
                    </div>
                  </div>
                  <button
                    onClick={handleProceedToChoices}
                    className="px-6 py-2.5 text-[13px]"
                    style={{
                      backgroundColor: 'transparent',
                      color: GLOW_COLOR,
                      fontFamily: '"Ma Shan Zheng", serif',
                      letterSpacing: '0.3em',
                      border: `1px solid ${BORDER_COLOR}`,
                      borderRadius: 2,
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 0 16px ${GLOW_COLOR}`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    携 此 天 光 · 看 分 岔
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {phase === 'committing' && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <input
                type="text"
                value={currentCommit}
                onChange={(e) => setCurrentCommit(e.target.value.slice(0, 60))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommit();
                  }
                }}
                placeholder="落笔一句你的本心所向 (可不填,Enter 跳过)"
                maxLength={60}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  marginBottom: '10px',
                  background: 'rgba(8,8,12,0.75)',
                  backdropFilter: 'blur(8px)',
                  color: '#F0EBDD',
                  fontSize: '13px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  border: `1px solid ${BORDER_COLOR}50`,
                  borderRadius: 2,
                  outline: 'none',
                  letterSpacing: '0.15em',
                  textAlign: 'center',
                  boxShadow: `0 0 16px ${GLOW_COLOR}30`,
                }}
              />
              <button
                onClick={handleCommit}
                style={{
                  padding: '12px 36px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '13px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.3em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: `0 0 24px ${GLOW_COLOR}50`,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 36px ${GLOW_COLOR}`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = `0 0 24px ${GLOW_COLOR}50`;
                }}
              >
                落 笔 · 看 分 岔
                <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 最终阶段操作按钮 - z-40 高于推演记录侧栏(z-30), 保证可点击 */}
        <AnimatePresence>
          {phase === 'final' && (
            <motion.div
              className="absolute bottom-8 z-40"
              style={{
                left: showHistoryPanel ? 'calc(50% - 140px)' : '50%',
                transform: 'translateX(-50%)',
                display: 'flex', gap: '12px',
                transition: 'left 0.5s ease',
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <button
                onClick={handleRestart}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(8,8,12,0.8)',
                  backdropFilter: 'blur(8px)',
                  color: GLOW_COLOR,
                  fontSize: '12px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.2em',
                  border: `1px solid ${BORDER_COLOR}`,
                  cursor: 'pointer',
                  boxShadow: `0 0 16px ${GLOW_COLOR}30`,
                }}
              >
                重新推演
              </button>
              <button
                onClick={handleSaveToCollection}
                style={{
                  padding: '10px 24px',
                  background: `linear-gradient(135deg, ${BORDER_COLOR} 0%, ${GLOW_COLOR} 100%)`,
                  color: '#0E0A06',
                  fontSize: '12px',
                  fontWeight: 600,
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.2em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: `0 0 24px ${GLOW_COLOR}60`,
                }}
              >
                收藏此命签
              </button>
              <button
                onClick={() => setShowHistoryPanel(true)}
                style={{
                  padding: '10px 24px',
                  background: 'rgba(8,8,12,0.8)',
                  backdropFilter: 'blur(8px)',
                  color: '#E0DDD5',
                  fontSize: '12px',
                  fontFamily: '"Ma Shan Zheng", serif',
                  letterSpacing: '0.2em',
                  border: `1px solid ${BORDER_COLOR}50`,
                  cursor: 'pointer',
                }}
              >
                查看完整记录
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 输入遮罩 */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.95)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            >
              <div className="p-7" style={{ backgroundColor: 'rgba(8,8,12,0.95)', border: `1px solid ${BORDER_COLOR}`, boxShadow: `0 0 40px ${GLOW_COLOR}20` }}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 flex items-center justify-center text-[14px]" style={{ color: GLOW_COLOR, fontFamily: '"Ma Shan Zheng", serif', border: `1px solid ${BORDER_COLOR}`, textShadow: `0 0 8px ${GLOW_COLOR}` }}>演</div>
                  <div className="flex flex-col leading-none">
                    <span className="text-base" style={{ color: '#FFF8E8', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>推演台</span>
                    <span className="text-[8px] tracking-[0.2em] mt-1" style={{ color: '#807870' }}>YAN · SANDBOX</span>
                  </div>
                </div>
                <p className="text-[11px] mb-5 mt-3" style={{ color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}>
                  写下你正在纠结的抉择，系统将立卦推演，诸智各抒己见。
                </p>
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value.slice(0, 500))}
                  placeholder="例如：要不要接那个新 Offer？"
                  maxLength={500}
                  className="w-full h-20 p-3 text-xs resize-none focus:outline-none"
                  style={{ border: `1px solid ${BORDER_COLOR}40`, backgroundColor: 'rgba(255,255,255,0.03)', color: '#F0EDE5', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.8 }}
                />
                <button
                  onClick={handleStart}
                  disabled={!inputValue.trim()}
                  className="w-full mt-4 py-3 text-sm transition-all"
                  style={{
                    background: inputValue.trim() ? `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})` : 'rgba(255,255,255,0.05)',
                    color: '#1A1410',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.3em',
                    border: `1px solid ${BORDER_COLOR}`,
                    cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
                    opacity: inputValue.trim() ? 1 : 0.5,
                    boxShadow: inputValue.trim() ? `0 0 20px ${GLOW_COLOR}40` : 'none',
                  }}
                >
                  立卦开演
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 浮动提示 (替代 alert) */}
      <AnimatePresence>
        {floatTip && (
          <motion.div
            className="fixed left-1/2 -translate-x-1/2 z-[100] px-6 py-3"
            style={{
              bottom: 56,
              background: 'linear-gradient(135deg, #A8472E 0%, #8A3925 100%)',
              color: '#FAF6EC',
              borderRadius: 2,
              boxShadow: '0 8px 28px rgba(168,71,46,0.4)',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.2em',
              fontSize: 13,
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, y: 16, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.92 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            {floatTip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
