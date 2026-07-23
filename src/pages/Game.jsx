import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Board from '../components/board/GameBoard';
import ChoiceHud from '../components/board/ChoiceHud';
import AgentDialogueOverlay from '../components/board/AgentDialogueOverlay';
import ProcessStepper from '../components/board/ProcessStepper';
import { getAgentsForQuestion, detectQuestionType, QUESTION_TYPES } from '../data/agents';
import { COLORS } from '../components/board/layoutConfig';
import { generateInferenceContent, generateDialoguesForAgents, generateYanSummary, judgeContinueAsking, isLlmAvailable, generatePersonalizedCardContent } from '../services/inferenceEngine';
import { detectConvergenceFromBlackboard } from '../services/multiAgentFramework';
import { getCustomAgents, recommendSubscribedAgents } from '../utils/customAgent';
import { streamYanChat, addYanMemory, getYanMemories } from '../services/apiClient';
import { recallRelevantMemories, formatMemoriesForPrompt, saveWorkingMemory, saveEpisode, inferFactsFromSession, saveAgentFeedback, detectChoicePattern } from '../services/memoryStore';

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
  const [selectedAgentIds, setSelectedAgentIds] = useState(new Set());
  const [agentCallResults, setAgentCallResults] = useState({});
  // D3 DebateConvergence - 自适应收敛
  const MAX_DEBATE_ROUNDS = 3;
  const [debateRound, setDebateRound] = useState(1);
  const [debateConvergence, setDebateConvergence] = useState(null);
  const debateBlackboardRef = useRef(null);
  const [showAgentErrorModal, setShowAgentErrorModal] = useState(false);
  const [agentErrors, setAgentErrors] = useState({});
  const [yanMemories, setYanMemories] = useState([]);
  const [yanConversationId, setYanConversationId] = useState(null);
  const floatTipTimer = useRef(null);
  const stageTimersRef = useRef([]);

  const activeAgents = useMemo(() => {
    try {
      if (!userInput) return [];
      const presetAgents = getAgentsForQuestion(userInput) || [];
      const customAgentsList = getCustomAgents();
      const allAgents = [...presetAgents, ...customAgentsList];
      if ((phase === 'agent_debate' || phase === 'reflecting' || phase === 'summary' || phase === 'committing' || phase === 'final') && inference?.agents) {
        return inference.agents;
      }
      return allAgents;
    } catch (e) {
      console.error('[activeAgents] 生成失败:', e);
      return [];
    }
  }, [userInput, phase, inference]);

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

  // handleRestart 必须在 handleStart 之前定义，避免 TDZ 错误
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
    setDebateRound(1);
    setDebateConvergence(null);
    debateBlackboardRef.current = null;
  }, [clearTimers]);

  const handleStart = useCallback(async () => {
    try {
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

      let inf = null;
      try {
        inf = await generateInferenceContent(question);
      } catch (e) {
        console.error('[handleStart] 生成推演内容异常:', e);
        inf = null;
      }
      
      if (!inf || !inf.agents || inf.agents.length === 0) {
        console.warn('[handleStart] 生成推演内容失败，使用默认配置');
        inf = {
          agents: [
            { id: 'fengyan', name: '风眼', stance: '风险视角', role: 'permanent', trigram: '☵', color: '#A84848', glow: '#E88080' },
            { id: 'jingyuan', name: '镜渊', stance: '反思视角', role: 'permanent', trigram: '☶', color: '#685888', glow: '#A898C8' },
            { id: 'qiangu', name: '钱谷', stance: '财务视角', role: 'dynamic', trigram: '☰', color: '#C88848', glow: '#E8B880' },
            { id: 'luxiang', name: '路向', stance: '职业视角', role: 'dynamic', trigram: '☴', color: '#508870', glow: '#80C8A8' },
          ],
          agentDialogues: {},
          powerfulQuestion: '细细思索，你最在意的是什么？',
        };
      }
      setInference(inf);

      clearTimers();

      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

      await delay(4000);
      setPhase('analyzing');

      await delay(3000);
      setPhase('summoning');

      await delay(2500);
      setPhase('yan_analyze');
      
      // 立即设置演的初始对话，防止白页
      setAgentDialogues(prev => ({
        ...prev,
        yan: '演 · 正在思索……',
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), '演 · 正在思索……'] },
      }));
      
      let yanText = '';
      let source = 'preset';
      
      try {
        let backendMemories = [];
        try {
          backendMemories = await getYanMemories(question.slice(0, 20));
          setYanMemories(backendMemories || []);
        } catch (e) {
          console.warn('[演分析] 后端记忆失败:', e);
        }

        // 本地分层记忆召回（工作/事实/情景/语义四类）
        const localMemories = recallRelevantMemories(question);
        const localMemoryContext = formatMemoriesForPrompt(localMemories);
        const backendMemoryContext = (backendMemories || []).slice(0, 5)
          .map(m => `【记忆】${m.title}: ${m.content.slice(0, 50)}`).join('\n');
        const memoryContext = [localMemoryContext, backendMemoryContext].filter(Boolean).join('\n\n');
        const fullQuestion = memoryContext ? `${question}\n\n用户过往相关信息:\n${memoryContext}` : question;

        if (isLlmAvailable()) {
          setFloatTip('演 · 正在思考分析...');
          try {
            const result = await streamYanChat({ 
              message: `请分析用户的问题，并提出一个关键的追问来帮助深入了解用户的真实情况。\n\n用户问题：${fullQuestion}`,
              conversationId: yanConversationId 
            }, (chunk, fullText, convId) => {
              setYanConversationId(convId);
            });
            
            if (result && result.text && result.text.length > 5) {
              yanText = result.text;
              source = 'llm';
              if (result.conversationId) {
                setYanConversationId(result.conversationId);
              }
            }
          } catch (e) {
            console.warn('[演分析] streamYanChat失败:', e);
          }
        }
      } catch (e) {
        console.warn('[演分析] 整体处理失败，降级本地:', e);
      }

      if (!yanText || yanText.length <= 5) {
        const currentInf = inf || {};
        if (currentInf.reasoning && currentInf.analysis) {
          yanText = `${currentInf.analysis}\n\n${currentInf.reasoning}\n\n${currentInf.powerfulQuestion || '细细思索，你最在意的是什么？'}`;
        } else if (currentInf.reasoning) {
          yanText = `${currentInf.reasoning}\n\n${currentInf.powerfulQuestion || '细细思索，你最在意的是什么？'}`;
        } else if (currentInf.analysis) {
          yanText = `${currentInf.analysis}\n\n${currentInf.powerfulQuestion || '细细思索，你最在意的是什么？'}`;
        } else {
          yanText = currentInf.powerfulQuestion || '此问关乎抉择，让我细细思索……';
        }
        source = 'preset';
      }
      
      setFloatTip(null);
      
      setAgentDialogues(prev => ({
        ...prev,
        yan: yanText,
        history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), { text: yanText, source }] },
      }));
      setAwaitingUser(true);
    } catch (e) {
      console.error('[handleStart] 推演启动失败:', e);
      setFloatTip('推演启动失败，请重试');
      setTimeout(() => {
        handleRestart();
      }, 2000);
    }
  }, [inputValue, clearTimers, yanConversationId, handleRestart]);

  // 用户点击"继续" - 推进到下一位 Agent 或下一阶段
  const handleUserAdvance = useCallback(async () => {
    if (!inference) return;

    if (phase === 'yan_analyze') {
      // 保存用户对演追问的回答
      const yanAnswer = currentResponse.trim();
      if (yanAnswer) {
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          const arr = history.yan || [];
          history.yan = [...arr, `【你】${yanAnswer}`];
          return { ...prev, yan: `【你】${yanAnswer}`, history };
        });
        setCurrentResponse('');

        // 将用户回答发送给演，获取提炼后的分析
        try {
          setFloatTip('演 · 正在消化你的回答...');
          const result = await streamYanChat({
            message: `用户对你的追问回答如下：\n"${yanAnswer}"\n\n请基于这个回答，用2-3句话提炼关键信息，这些信息将传递给智囊团作为分析背景。直接输出提炼结果，不要寒暄。`,
            conversationId: yanConversationId
          }, (chunk, fullText, convId) => {
            setYanConversationId(convId);
          });

          if (result && result.text && result.text.length > 5) {
            setYanConversationId(result.conversationId);
            // 将提炼的信息保存，供Agent使用
            setInference(prev => prev ? { ...prev, userContext: result.text } : prev);
            // 更新演的发言
            setAgentDialogues(prev => ({
              ...prev,
              yan: result.text,
              history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), { text: result.text, source: 'llm' }] },
            }));
          }
        } catch (e) {
          console.warn('[演追问] 处理用户回答失败:', e);
        }
        setFloatTip(null);
      }

      setPhase('agent_select');
      const agents = inference.agents || [];
      // 演·推荐：基于问题关键词匹配订阅智囊，自动预选中（最多1个，避免过多）
      const recommended = recommendSubscribedAgents(userInput);
      const preSelected = new Set(agents.slice(0, 2).map(a => a.id));
      if (recommended.length > 0) {
        preSelected.add(recommended[0].id);
        // 推荐提示
        setFloatTip(`演荐 · ${recommended[0].name} 或可参议`);
        setTimeout(() => setFloatTip(null), 3000);
      }
      setSelectedAgentIds(preSelected);
      setAwaitingUser(true);
      return;
    }
    
    const agents = inference.agents;
    const dialogues = inference.agentDialogues;
    const currentIdx = activeAgentIdx;
    const currentAgent = agents[currentIdx];

    // 保存用户对当前 Agent 的回应(如有)
    const userAnswer = currentResponse.trim();
    if (userAnswer && currentIdx >= 0) {
      const agentId = currentAgent.id;
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        const arr = history[agentId] || [];
        history[agentId] = [...arr, `【你】${userAnswer}`];
        return { ...prev, [agentId]: `【你】${userAnswer}`, history };
      });
      setCurrentResponse('');
    }

    setAwaitingUser(false);

    // 获取当前Agent的对话历史
    const dialogueHistory = [];
    if (currentIdx >= 0) {
      const agentHistory = agentDialogues.history?.[currentAgent.id] || [];
      dialogueHistory.push(...agentHistory);
    }

    // 判断当前Agent是否需要继续追问
    if (currentIdx >= 0) {
      const continueResult = await judgeContinueAsking(currentAgent, userInput, dialogueHistory, userAnswer);
      if (continueResult.continueAsking && continueResult.nextQuestion) {
        const nextQuestion = continueResult.nextQuestion;
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
          const arr = history[currentAgent.id] || [];
          history[currentAgent.id] = [...arr, nextQuestion];
          return { ...prev, [currentAgent.id]: nextQuestion, history };
        });
        setAwaitingUser(true);
        return;
      }
    }

    // 不需要追问，切换到下一位 Agent
    if (currentIdx < agents.length - 1) {
      const nextIdx = currentIdx + 1;
      const t = setTimeout(() => {
        setActiveAgentIdx(nextIdx);
        const dialogue = dialogues[agents[nextIdx].id] || '...';
        setAgentDialogues(prev => {
          const history = { ...(prev.history || {}) };
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
      setAwaitingUser(false);
      
      const yanSummary = await generateYanSummary(userInput, agentDialogues || {}, agents);
      setInference(prev => ({ ...(prev || {}), summary: yanSummary.summary || '诸位各抒己见,皆有道理。' }));

      // 动态分支：基于分歧度调整反思时长（分歧大→反思久，文案强调分歧）
      const consensusScore = debateConvergence?.consensusScore ?? 0.6;
      const isDivergent = !debateConvergence?.converged || consensusScore < 0.6;
      const reflectDelay = isDivergent ? 6500 : 4300;
      const reflectingText = isDivergent
        ? `诸位的分歧颇大,各执一词。\n${yanSummary.keyPoints?.join('、') || '各方视角,碰撞激烈'}\n分歧之中,常藏真意。让我再细加梳理……`
        : `诸位所议,皆有道理。\n${yanSummary.keyPoints?.join('、') || '各方视角,各有见地'}\n听罢,让我再思量一卦……`;

      const t1 = setTimeout(() => {
        setPhase('reflecting');
        setActiveAgentIdx(-1);
        setShowQuestion(false);
        setAgentDialogues(prev => ({
          ...prev,
          yan: reflectingText,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), reflectingText] },
        }));
      }, 800);
      const t2 = setTimeout(() => {
        setPhase('summary');
        let summaryText = yanSummary.summary || `诸位各抒己见,我已梳理完毕。\n此局无定论,关键在你自己。\n请做出你的抉择。`;
        // 演·点出模式：检测用户历史选择模式，连续≥3次同倾向时演主动提醒
        try {
          const pattern = detectChoicePattern();
          if (pattern.hint) {
            summaryText = `${summaryText}\n\n——\n${pattern.hint}`;
          }
        } catch (e) { /* ignore */ }
        setAgentDialogues(prev => ({
          ...prev,
          yan: summaryText,
          history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), summaryText] },
        }));
        setAwaitingUser(true);
      }, reflectDelay);
      stageTimersRef.current.push(t1, t2);
    }
  }, [activeAgentIdx, inference, currentResponse, userInput, agentDialogues, debateConvergence]);

  const handleConfirmAgents = useCallback(async () => {
    if (!inference) return;
    const customAgentsList = getCustomAgents();
    const allAgents = [...(inference.agents || []), ...customAgentsList];
    const selected = allAgents.filter(a => selectedAgentIds.has(a.id));
    if (selected.length === 0) {
      setFloatTip('请至少选择一位智囊');
      return;
    }
    setInference(prev => prev ? { ...prev, agents: selected } : { agents: selected });
    setAwaitingUser(false);
    
    clearTimers();
    setPhase('agent_debate');
    setActiveAgentIdx(0);
    setFloatTip('智囊正在斟酌发言…');
    
    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    let hasErrors = false;
    let allErrors = {};
    
    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      newDialogues[agentId] = text;
      callResults[agentId] = { success, error, source, collaboration };
      if (!success) {
        hasErrors = true;
        allErrors[agentId] = { agentName: selected.find(a => a.id === agentId)?.name || agentId, error: error || '未知错误' };
      }
      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
    };
    
    const onError = (errors) => {
      setAgentErrors(errors);
      setShowAgentErrorModal(true);
    };
    
    const result = await generateDialoguesForAgents(question, selected, qType, onAgentComplete, onError, inference.userContext, { round: 1 });
    setAgentCallResults(callResults);

    // D3 收敛检测 - 决定是否提示用户「再辩一轮」
    if (result.blackboard) {
      debateBlackboardRef.current = result.blackboard;
      const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: 1 });
      setDebateRound(1);
      setDebateConvergence(convergence);
    }
    
    if (hasErrors && Object.keys(allErrors).length > 0) {
      setAgentErrors(allErrors);
      setShowAgentErrorModal(true);
    }
    
    setFloatTip(null);
    
    const firstDialogue = newDialogues[selected[0].id] || '...';
    setAgentDialogues(prev => {
      const history = { ...(prev.history || {}) };
      const existing = history[selected[0].id] || [];
      if (existing.includes(firstDialogue)) return prev;
      history[selected[0].id] = [...existing, { text: firstDialogue, source: callResults[selected[0].id]?.source || 'preset' }];
      return { ...prev, [selected[0].id]: firstDialogue, history };
    });
    setAwaitingUser(true);
  }, [inference, selectedAgentIds, userInput, clearTimers]);

  // D3: 再辩一轮 - 复用 blackboard 上下文，让智囊基于前轮分歧深入
  const handleRunAnotherRound = useCallback(async () => {
    if (!inference || !inference.agents) return;
    const selected = inference.agents;
    const nextRound = debateRound + 1;
    if (nextRound > MAX_DEBATE_ROUNDS) return;

    setAwaitingUser(false);
    setActiveAgentIdx(0);
    setFloatTip(`第 ${nextRound} 轮辩论中…`);

    const question = userInput;
    const qType = detectQuestionType(question);
    const newDialogues = {};
    const callResults = {};
    const existingBlackboard = debateBlackboardRef.current;

    const onAgentComplete = (agentId, text, success, error, source, collaboration) => {
      newDialogues[agentId] = text;
      callResults[agentId] = { success, error, source, collaboration };
      setInference(prev => prev ? { ...prev, agentDialogues: { ...(prev.agentDialogues || {}), [agentId]: text } } : prev);
    };

    const result = await generateDialoguesForAgents(
      question, selected, qType, onAgentComplete, undefined, inference.userContext,
      { existingBlackboard, round: nextRound }
    );
    setAgentCallResults(prev => ({ ...prev, ...callResults }));

    if (result.blackboard) {
      debateBlackboardRef.current = result.blackboard;
      const convergence = detectConvergenceFromBlackboard(result.blackboard, { currentRound: nextRound });
      setDebateRound(nextRound);
      setDebateConvergence(convergence);
    }

    // 把本轮新发言追加到 history，并显示第一位智囊的新发言
    const firstId = selected[0]?.id;
    if (firstId && newDialogues[firstId]) {
      setAgentDialogues(prev => {
        const history = { ...(prev.history || {}) };
        for (const a of selected) {
          const t = newDialogues[a.id];
          if (t) {
            const arr = history[a.id] || [];
            history[a.id] = [...arr, { text: t, source: callResults[a.id]?.source || 'preset', round: nextRound }];
          }
        }
        return { ...prev, [firstId]: newDialogues[firstId], history };
      });
    }

    setFloatTip(null);
    setAwaitingUser(true);
  }, [inference, userInput, debateRound]);

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
    setPhase('path_reveal');
    setAgentDialogues(prev => ({
      ...prev,
      yan: '卦已成,天光已借。\n分岔在前,请选择你的路径。',
      history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), '卦已成,天光已借。分岔在前,请选择你的路径。'] },
    }));
  }, []);

  // 跳过占卜,直接看分岔
  const handleSkipOracle = useCallback(() => {
    setPhase('path_reveal');
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

  // handleRestart 已在前面定义

  // 保存到卡牌册 - 用 inference 真实数据,3 件实用品随卡入册
  const handleSaveToCollection = useCallback(async () => {
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
      const advisors = (activeAgents || []).filter(a => a && a.role !== 'master').map(a => a.name).filter(Boolean);
      const guaName = realGua?.gua || fb.gua;
      const trigram = realGua?.trigram || fb.trigram;
      const choiceLabel = selectedChoice?.label || '抓住机会';

      // 命签生成深化：LLM 根据卦象+智囊发言+抉择生成个性化 verse/summary
      const personalized = await generatePersonalizedCardContent({
        question: userInput,
        guaName,
        choiceLabel,
        agentDialogues: inference?.agentDialogues || {},
        trigram,
      });

      const card = {
        id: `card-${Date.now()}`,
        gua: guaName,
        trigram,
        element: realGua?.element || fb.element,
        title: choiceLabel,
        question: userInput,
        decision: choiceLabel,
        style: realGua?.element ? `${realGua.element}行` : fb.style,
        advisors: advisors.length > 0 ? advisors : ['演'],
        // 3 件实用品 - 推演成果随卡保存（verse/summary 用 LLM 个性化生成）
        verse: personalized.verse || inference?.verse || fb.verse,
        powerfulQuestion: inference?.powerfulQuestion || '',
        framework: inference?.framework || '',
        summary: personalized.summary || inference?.summary || '此卦已入卡牌册,留作后日之镜。',
        cardSource: personalized.source,
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
      
      addYanMemory({
        category: 'deduction',
        title: userInput.slice(0, 20) + (userInput.length > 20 ? '...' : ''),
        content: `问题：${userInput}\n决策：${selectedChoice?.label || '未选择'}\n卦象：${card.gua}\n总结：${card.summary.slice(0, 100)}`,
        source: '推演台',
        confidence: 0.8,
      }).catch(e => console.warn('[记忆保存] 失败', e));

      // 本地分层记忆：保存情景记忆 + 提取事实记忆
      try {
        saveEpisode({
          question: userInput,
          decision: selectedChoice?.label || '未选择',
          hexagram: card.gua || '',
          guaName: card.title || '',
          agents: (inference?.agents || []).map(a => a.id),
          choice: selectedChoice?.id || '',
        });
        inferFactsFromSession({
          question: userInput,
          choice: selectedChoice?.id,
          agents: inference?.agents || [],
        });
      } catch (e) {
        console.warn('[情景记忆保存] 失败', e);
      }
      
      setFloatTip(`命签「${card.gua} · ${card.title}」已入卡牌册`);
      if (floatTipTimer.current) clearTimeout(floatTipTimer.current);
      floatTipTimer.current = setTimeout(() => setFloatTip(null), 2400);
    } catch (e) {
      console.error('保存失败', e);
    }
  }, [selectedChoice, userInput, activeAgents, inference]);

  // 顶栏提示文字
  const phaseLabel = useMemo(() => {
    try {
      const agents = activeAgents || [];
      const nonMasterAgents = agents.filter(a => a.role !== 'master');
      switch (phase) {
        case 'casting': return '演 · 起卦 · 投三枚铜钱';
        case 'analyzing': return '演 · 理解问题';
        case 'summoning': return `演 · 召唤顾问 · ${nonMasterAgents.length} 位`;
        case 'agent_debate': return activeAgentIdx >= 0 ? `${nonMasterAgents[activeAgentIdx]?.name || ''} 发言中 · ${activeAgentIdx + 1}/${nonMasterAgents.length}` : '诸智集结';
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
    } catch (e) {
      console.error('[phaseLabel] 生成失败:', e);
      return '';
    }
  }, [phase, activeAgentIdx, activeAgents, oracleThrowing, oracleResult]);

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
          question={userInput}
          activeAgentIdx={activeAgentIdx}
          activeAgents={activeAgents}
          agentDialogues={agentDialogues}
          selectedAgentIds={selectedAgentIds}
          onAgentToggle={(id) => setSelectedAgentIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          onConfirmAgents={handleConfirmAgents}
          awaitingUser={awaitingUser}
          currentResponse={currentResponse}
          setCurrentResponse={setCurrentResponse}
          onUserAdvance={handleUserAdvance}
          agentCallResults={agentCallResults}
          onFeedback={(agentId, feedbackType, dialogue) => {
            saveAgentFeedback(agentId, feedbackType, userInput, dialogue);
          }}
          debateConvergence={debateConvergence}
        />

        {/* D3 收敛状态徽标 */}
        {phase === 'agent_debate' && debateConvergence && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
              padding: '4px 14px', background: 'rgba(10,10,15,0.6)', borderRadius: '14px',
              border: '1px solid #C8A85030', zIndex: 25,
            }}
          >
            <span style={{ color: debateConvergence.converged ? '#80C8A8' : '#F0D890', fontSize: '11px', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em' }}>
              {debateConvergence.converged
                ? `第${debateRound}轮已收敛 · ${debateConvergence.reason === 'consensus' ? '共识达成' : '循环停止'}`
                : `第${debateRound}轮 · 共识度 ${(debateConvergence.consensusScore ?? 0.5).toFixed(2)}`}
            </span>
          </motion.div>
        )}

        {/* D3 再辩一轮入口 - 已移至底部输入框下方，临近继续按钮 */}

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

        {/* 用户推进控制 - yan_analyze、agent_debate 和 summary 阶段 */}
        <AnimatePresence>
          {awaitingUser && (phase === 'yan_analyze' || phase === 'agent_debate' || phase === 'summary') && (
            <motion.div
              className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center"
              style={{ bottom: '24px', width: 'min(640px, 90vw)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              {/* 用户回应输入 - yan_analyze 和 agent_debate 阶段都有 */}
              {(phase === 'yan_analyze' || phase === 'agent_debate') && (
                <div className="w-full mb-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value.slice(0, 120))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleUserAdvance();
                      }
                    }}
                    placeholder={phase === 'yan_analyze' ? '回答演的问题，帮助智囊团更好分析...' : '可以补充信息,也可留空直接翻牌'}
                    maxLength={120}
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
                {phase === 'yan_analyze' ? '召唤智囊' : phase === 'summary' ? '看分岔 · 抉择' : (activeAgentIdx < activeAgents.filter(a => a.role !== 'master').length - 1 ? '下一位发言' : '请演总结')}
                <span style={{ marginLeft: '12px', opacity: 0.6, fontSize: '11px' }}>·  ENTER</span>
              </button>

              {/* D3 再辩一轮 - 仅当所有智囊发言完毕且未收敛时显示，紧贴"请演总结"按钮下方 */}
              {phase === 'agent_debate' && debateConvergence && !debateConvergence.converged && debateRound < MAX_DEBATE_ROUNDS && activeAgentIdx >= activeAgents.filter(a => a.role !== 'master').length - 1 && (
                <motion.button
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  onClick={handleRunAnotherRound}
                  style={{
                    marginTop: '12px',
                    padding: '6px 18px',
                    background: 'transparent',
                    color: '#F0D890',
                    fontSize: '11px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.25em',
                    border: `1px solid ${BORDER_COLOR}60`,
                    borderRadius: '2px',
                    cursor: 'pointer',
                    opacity: 0.85,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = GLOW_COLOR; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.borderColor = `${BORDER_COLOR}60`; }}
                  title={`共识度 ${(debateConvergence.consensusScore ?? 0.5).toFixed(2)}，可让智囊再深入辩一轮`}
                >
                  ⟳ 再辩一轮 · 第 {debateRound + 1} 轮
                </motion.button>
              )}
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

      {/* Agent调用失败弹窗 */}
      <AnimatePresence>
        {showAgentErrorModal && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="max-w-md w-full mx-4"
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -20 }}
              transition={{ duration: 0.4 }}
              style={{
                background: 'rgba(15,12,8,0.98)',
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: 4,
                padding: '24px',
                boxShadow: `0 0 40px ${GLOW_COLOR}20`,
              }}
            >
              <div style={{ fontSize: '16px', color: '#E88080', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em', marginBottom: '16px', textAlign: 'center' }}>
                智囊发言异常
              </div>
              <div style={{ fontSize: '12px', color: '#A0A0A0', fontFamily: '"Noto Serif SC", serif', marginBottom: '16px', lineHeight: 1.8 }}>
                以下智囊未能连接到AI生成真实回答，使用了预设模板：
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {Object.entries(agentErrors).map(([agentId, error]) => (
                  <div key={agentId} style={{
                    padding: '10px 12px',
                    background: 'rgba(168,64,64,0.1)',
                    border: '1px solid #A8404040',
                    borderRadius: 2,
                  }}>
                    <div style={{ color: '#E88080', fontSize: '13px', fontWeight: 600 }}>{error.agentName}</div>
                    <div style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>{error.error}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setShowAgentErrorModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: 'rgba(60,55,50,0.5)',
                    border: `1px solid ${BORDER_COLOR}40`,
                    borderRadius: 2,
                    color: '#A0A0A0',
                    fontSize: '12px',
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  跳过，继续推演
                </button>
                <button
                  onClick={() => {
                    setShowAgentErrorModal(false);
                    const question = userInput;
                    const qType = detectQuestionType(question);
                    const agents = inference?.agents || [];
                    const newDialogues = {};
                    const callResults = {};
                    setFloatTip('正在重试...');
                    const onAgentComplete = (agentId, text, success, error, source) => {
                      newDialogues[agentId] = text;
                      callResults[agentId] = { success, error, source };
                      setInference(prev => prev ? { ...prev, agentDialogues: { ...newDialogues } } : { agentDialogues: newDialogues });
                    };
                    generateDialoguesForAgents(question, agents, qType, onAgentComplete).then(() => {
                      setFloatTip(null);
                      setAgentCallResults(callResults);
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    background: `linear-gradient(135deg, ${BORDER_COLOR}, ${GLOW_COLOR})`,
                    border: 'none',
                    borderRadius: 2,
                    color: '#1A1410',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: '"Ma Shan Zheng", serif',
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                  }}
                >
                  重试连接
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
