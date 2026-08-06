/**
 * 智囊铸造 - 5步严谨向导（v2 - 动态对话式）
 * 步骤1: 赐名 + 描述
 * 步骤2: 演理解语境 → 选关系 + 选视角（支持自定义+LLM推荐）
 * 步骤3: 演递进审问 → 对话式追问（非固定3问，基于回答动态生成下一问）
 * 步骤4: 封印开光 → 生成评语
 * 步骤5: 入营
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  validateAgentName,
  validateAgentDesc,
  understandNameContext,
  suggestPerspective,
  generateNextInterviewQuestion,
  refinePersonaWithInterview,
  generateSealingBlessing,
  forgeAgent,
  RELATION_OPTIONS,
  PERSPECTIVE_OPTIONS,
} from '../utils/customAgent';
import { createAdvisor } from '../services/deliberationClient';
import { getCurrentUserIdSync } from '../services/baseConfig';

const EASE = [0.16, 1, 0.3, 1];

const STEP_LABELS = ['赐名', '定关系', '演审问', '封印', '入营'];

export default function AgentCreator({ onClose, onSaved, existingAgents = [] }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 步骤2状态
  const [contextSummary, setContextSummary] = useState('');
  const [relation, setRelation] = useState('');
  const [perspective, setPerspective] = useState('');
  const [customPerspective, setCustomPerspective] = useState('');
  const [perspectiveSuggestions, setPerspectiveSuggestions] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  // 步骤3状态 - 对话式审问
  const [interviewQA, setInterviewQA] = useState([]); // [{q, a}]
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [questionLoading, setQuestionLoading] = useState(false);
  const answerRef = useRef(null);

  // 步骤4状态
  const [persona, setPersona] = useState('');
  const [blessing, setBlessing] = useState('');
  const [forgedAgent, setForgedAgent] = useState(null);
  const [source, setSource] = useState('local');

  // ===== 步骤1 → 步骤2 =====
  const handleStep1Next = async () => {
    setError('');
    const nameCheck = validateAgentName(name, existingAgents);
    if (!nameCheck.valid) { setError(nameCheck.message); return; }
    const descCheck = validateAgentDesc(desc);
    if (!descCheck.valid) { setError(descCheck.message); return; }

    setStep(1);
    setLoading(true);
    try {
      // 并行：理解语境 + 推荐视角
      const [ctxResult, suggResult] = await Promise.all([
        understandNameContext(name, desc, conversationId),
        suggestPerspective(name, desc, '', conversationId),
      ]);
      setContextSummary(ctxResult.summary);
      if (ctxResult.relationGuess) {
        const match = RELATION_OPTIONS.find(r => r.label === ctxResult.relationGuess || r.id === ctxResult.relationGuess);
        if (match) setRelation(match.id);
      }
      if (ctxResult.conversationId) setConversationId(ctxResult.conversationId);
      setSource(ctxResult.source);
      setPerspectiveSuggestions(suggResult.suggestions || []);
      if (suggResult.conversationId) setConversationId(suggResult.conversationId);
    } catch (e) {
      setContextSummary(`「${name}」是用户要邀请入营的智囊。`);
    } finally {
      setLoading(false);
    }
  };

  // 选择关系后刷新视角推荐
  const handleSelectRelation = async (relId) => {
    setRelation(relId);
    setError('');
    // 如果已经有名字，重新推荐视角
    if (name.trim()) {
      try {
        const suggResult = await suggestPerspective(name, desc, relId, conversationId);
        setPerspectiveSuggestions(suggResult.suggestions || []);
        if (suggResult.conversationId) setConversationId(suggResult.conversationId);
      } catch (e) { /* ignore */ }
    }
  };

  // 选择视角
  const handleSelectPerspective = (pId) => {
    setPerspective(pId);
    setError('');
    if (pId !== 'custom') {
      setCustomPerspective('');
    }
  };

  // 点击推荐视角
  const handleApplySuggestion = (sugg) => {
    setPerspective(sugg.id);
    setError('');
    if (sugg.id === 'custom') {
      setCustomPerspective(sugg.label.replace(/视角$/, ''));
    } else {
      setCustomPerspective('');
    }
  };

  // 获取当前视角标签
  const getPerspectiveLabel = () => {
    if (perspective === 'custom') return customPerspective.trim() || '自定义视角';
    const opt = PERSPECTIVE_OPTIONS.find(p => p.id === perspective);
    return opt?.label || perspective;
  };

  // ===== 步骤2 → 步骤3 =====
  const handleStep2Next = async () => {
    if (!relation) { setError(`请选择「${name}」与你的关系`); return; }
    if (!perspective) { setError('请选择这位智囊的主视角'); return; }
    if (perspective === 'custom' && !customPerspective.trim()) { setError('请输入自定义视角名称'); return; }
    setError('');
    setStep(2);
    // 生成第一问
    await askNextQuestion([]);
  };

  // 生成下一个审问问题
  const askNextQuestion = async (prevQA) => {
    setQuestionLoading(true);
    setCurrentAnswer('');
    try {
      const result = await generateNextInterviewQuestion({
        name,
        relation,
        perspective,
        perspectiveLabel: getPerspectiveLabel(),
        contextSummary,
        previousQA: prevQA,
      }, conversationId);
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.isLast || !result.question) {
        // 3轮已完成，直接进入封印
        setInterviewQA(prevQA);
        await proceedToSeal(prevQA);
        return;
      }
      setCurrentQuestion(result.question);
    } catch (e) {
      setCurrentQuestion('「' + name + '」最擅长在什么场景下发言？');
    } finally {
      setQuestionLoading(false);
      setTimeout(() => answerRef.current?.focus(), 300);
    }
  };

  // 用户提交回答
  const handleSubmitAnswer = async () => {
    const answer = currentAnswer.trim();
    if (!answer) { setError('请输入回答，或点击"换个问法"'); return; }
    setError('');
    const newQA = [...interviewQA, { q: currentQuestion, a: answer }];
    setInterviewQA(newQA);
    setCurrentAnswer('');

    if (newQA.length >= 3) {
      // 3轮完成，进入封印
      await proceedToSeal(newQA);
    } else {
      // 继续下一问
      await askNextQuestion(newQA);
    }
  };

  // 换个问法（让LLM重新生成当前问题）
  const handleRephraseQuestion = async () => {
    setError('');
    setCurrentAnswer('');
    // 传一个特殊标记让LLM重新问
    setQuestionLoading(true);
    try {
      // 把"换个问法"也作为一次对话，让LLM知道用户不懂
      const qaWithRephrase = [...interviewQA, { q: currentQuestion, a: '这个问题我不太确定，能换个角度问吗？' }];
      const result = await generateNextInterviewQuestion({
        name, relation, perspective,
        perspectiveLabel: getPerspectiveLabel(),
        contextSummary,
        previousQA: qaWithRephrase,
      }, conversationId);
      if (result.conversationId) setConversationId(result.conversationId);
      if (result.question) {
        // 不把"换个问法"计入正式QA，只替换当前问题
        setCurrentQuestion(result.question);
      }
    } catch (e) { /* ignore */ }
    setQuestionLoading(false);
  };

  // 跳过当前问题（答不出来，直接进入下一轮）
  const handleSkipQuestion = async () => {
    setError('');
    setCurrentAnswer('');
    const newQA = [...interviewQA, { q: currentQuestion, a: '（跳过）' }];
    setInterviewQA(newQA);
    if (newQA.length >= 3) {
      await proceedToSeal(newQA);
    } else {
      await askNextQuestion(newQA);
    }
  };

  // ===== 步骤3 → 步骤4：封印 =====
  const proceedToSeal = async (finalQA) => {
    setStep(3);
    setLoading(true);
    try {
      const perspLabel = getPerspectiveLabel();
      const answersForRefine = finalQA.map(qa => qa.a === '（跳过）' ? '' : qa.a);
      const personaResult = await refinePersonaWithInterview(
        name, relation, perspective, contextSummary,
        finalQA, // 传对话式 QA 数组
        conversationId,
        perspective === 'custom' ? perspLabel : undefined,
      );
      setPersona(personaResult.persona);
      if (personaResult.conversationId) setConversationId(personaResult.conversationId);

      const agent = forgeAgent({
        name, desc, relation, perspective,
        perspectiveLabel: perspective === 'custom' ? perspLabel : undefined,
        contextSummary,
        persona: personaResult.persona,
        blessing: '',
        source,
      });
      const blessingResult = await generateSealingBlessing(agent, personaResult.conversationId || conversationId);
      const finalAgent = { ...agent, blessing: blessingResult.blessing };
      if (blessingResult.conversationId) setConversationId(blessingResult.conversationId);
      setBlessing(blessingResult.blessing);
      setForgedAgent(finalAgent);
    } catch (e) {
      setError('封印失败：' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const handleStep4Confirm = async () => {
    if (!forgedAgent) return;
    setError('');
    setLoading(true);
    try {
      const userId = getCurrentUserIdSync();
      if (!userId) {
        setError('未获取到用户信息，请先登录');
        setLoading(false);
        return;
      }
      // 把铸造的智囊存到后端 custom_advisors 表
      const saved = await createAdvisor({
        name: forgedAgent.name,
        persona: forgedAgent.persona,
        perspective: forgedAgent.stance,
        trigram: forgedAgent.trigram,
      });
      // 合并 DB id 与铸造时的展示字段，供前端卡片显示
      const displayAgent = { ...forgedAgent, id: saved.id };
      setStep(4);
      onSaved?.(displayAgent);
    } catch (e) {
      setError('入营失败：' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 铸造完成后返回 sandbox 推演台，携带 state 标记供 Game.jsx 检测恢复
  const handleReturnToSandbox = () => {
    navigate('/sandbox', { state: { returnToSandbox: true, newAgentCreated: true } });
    onClose?.();
  };

  const canBack = step > 0 && step < 4 && !loading && !questionLoading;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10, 10, 15, 0.88)',
        backdropFilter: 'blur(10px)',
        zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.92, y: 20, opacity: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(500px, 92vw)',
          maxHeight: '90vh', overflow: 'auto',
          background: 'linear-gradient(160deg, rgba(40,35,30,0.97), rgba(20,18,15,0.97))',
          border: '1px solid #C8A85040',
          borderRadius: '14px',
          padding: '28px 26px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,168,80,0.08) inset',
        }}
      >
        {/* 进度条 */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '22px' }}>
          {STEP_LABELS.map((label, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <motion.div
                animate={{
                  backgroundColor: i <= step ? '#C8A850' : '#3A3530',
                  scaleX: i <= step ? 1 : 0.6,
                }}
                transition={{ duration: 0.3 }}
                style={{
                  height: '3px', borderRadius: '2px', marginBottom: '6px',
                  transformOrigin: 'center',
                }}
              />
              <span style={{
                fontSize: '9px', color: i <= step ? '#F0D890' : '#6A6560',
                letterSpacing: '0.1em', fontFamily: '"Ma Shan Zheng", serif',
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* 步骤1: 赐名 */}
          {step === 0 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <StepHeader title="赐名入册" subtitle="为这位智囊起一个名号" />
              <Field label="智囊名号">
                <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }}
                  placeholder="如：钱谷、镜渊、宝宝…" maxLength={8}
                  style={inputStyle} />
              </Field>
              <Field label="视角描述（选填）">
                <textarea value={desc} onChange={(e) => { setDesc(e.target.value); setError(''); }}
                  placeholder="TA看世界的独特角度是什么？" rows={2} maxLength={80}
                  style={{ ...inputStyle, resize: 'none' }} />
              </Field>
              {error && <ErrorTip text={error} />}
              <StepButtons onNext={handleStep1Next} nextLabel="演来理解" disabled={!name.trim()} />
            </motion.div>
          )}

          {/* 步骤2: 定关系+视角 */}
          {step === 1 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <StepHeader title="定关系 · 选视角" subtitle="演需认清TA是谁、从哪个角度发言" />
              {loading ? (
                <LoadingTip text={`演正在理解「${name}」的语境…`} />
              ) : (
                <>
                  {contextSummary && (
                    <div style={{ padding: '10px 12px', background: 'rgba(200,168,80,0.06)', border: '1px solid #C8A85030', borderRadius: '6px', marginBottom: '14px' }}>
                      <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '4px', letterSpacing: '0.15em' }}>演的理解</div>
                      <div style={{ fontSize: '12px', color: '#D8D0C0', lineHeight: 1.6 }}>{contextSummary}</div>
                    </div>
                  )}

                  {/* 演推荐视角 */}
                  {perspectiveSuggestions.length > 0 && !perspective && (
                    <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'rgba(200,168,80,0.04)', border: '1px dashed #C8A85040', borderRadius: '6px' }}>
                      <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '8px', letterSpacing: '0.1em' }}>☯ 演的推荐</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {perspectiveSuggestions.map((sugg, i) => (
                          <motion.button
                            key={i}
                            whileHover={{ x: 4 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleApplySuggestion(sugg)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '8px 10px', background: 'rgba(200,168,80,0.06)',
                              border: '1px solid #C8A85020', borderRadius: '4px',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <span style={{ fontSize: '13px', color: sugg.id === 'custom' ? '#F0D890' : '#C8A850', fontFamily: '"Ma Shan Zheng", serif' }}>
                              {sugg.label}
                            </span>
                            <span style={{ fontSize: '10px', color: '#807870', flex: 1 }}>{sugg.reason}</span>
                            <span style={{ fontSize: '10px', color: '#6A6560' }}>→</span>
                          </motion.button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Field label="TA与你的关系">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {RELATION_OPTIONS.map(r => (
                        <OptionChip key={r.id} active={relation === r.id} onClick={() => handleSelectRelation(r.id)}>
                          <span style={{ fontSize: '14px' }}>{r.icon}</span>
                          <span style={{ fontSize: '10px' }}>{r.label}</span>
                        </OptionChip>
                      ))}
                    </div>
                  </Field>
                  <Field label="TA的主视角">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '8px' }}>
                      {PERSPECTIVE_OPTIONS.map(p => (
                        <OptionChip key={p.id} active={perspective === p.id} onClick={() => handleSelectPerspective(p.id)} color={p.color}>
                          <span style={{ fontSize: '14px' }}>{p.icon}</span>
                          <span style={{ fontSize: p.id === 'custom' ? '10px' : '9px' }}>{p.id === 'custom' ? '✦自定义' : p.label.replace('视角', '')}</span>
                        </OptionChip>
                      ))}
                    </div>
                    {perspective === 'custom' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <input
                          value={customPerspective}
                          onChange={(e) => { setCustomPerspective(e.target.value); setError(''); }}
                          placeholder="输入你需要的视角，如：创业者视角、法律视角、母亲视角…"
                          maxLength={10}
                          style={inputStyle}
                        />
                      </motion.div>
                    )}
                    {perspective && perspective !== 'custom' && (
                      <div style={{ fontSize: '10px', color: '#807870', fontStyle: 'italic', marginTop: '4px' }}>
                        {PERSPECTIVE_OPTIONS.find(p => p.id === perspective)?.desc}
                      </div>
                    )}
                  </Field>
                  {error && <ErrorTip text={error} />}
                  <StepButtons onBack={canBack ? () => setStep(0) : null} onNext={handleStep2Next} nextLabel="演来审问" disabled={!relation || !perspective || (perspective === 'custom' && !customPerspective.trim())} />
                </>
              )}
            </motion.div>
          )}

          {/* 步骤3: 演审问 - 对话式 */}
          {step === 2 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <StepHeader title="演之审问" subtitle="三问递进，塑TA之魂" />

              {/* 已回答的 QA 历史 */}
              {interviewQA.length > 0 && (
                <div style={{ marginBottom: '14px', maxHeight: '160px', overflowY: 'auto' }}>
                  {interviewQA.map((qa, i) => (
                    <div key={i} style={{ marginBottom: '10px', padding: '8px 10px', background: 'rgba(200,168,80,0.04)', borderRadius: '5px', border: '1px solid #C8A85015' }}>
                      <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '3px' }}>第{i + 1}问</div>
                      <div style={{ fontSize: '11px', color: '#F0D890', fontStyle: 'italic', marginBottom: '4px', lineHeight: 1.5 }}>{qa.q}</div>
                      <div style={{ fontSize: '11px', color: '#A09888' }}>{qa.a}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* 当前问题 */}
              {questionLoading ? (
                <LoadingTip text="演正在拟审问之辞…" compact />
              ) : currentQuestion ? (
                <>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '4px', letterSpacing: '0.1em' }}>
                      第{interviewQA.length + 1}问 {interviewQA.length >= 2 && '（最后一问）'}
                    </div>
                    <motion.div
                      key={currentQuestion}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        fontSize: '13px', color: '#F0D890', fontStyle: 'italic',
                        lineHeight: 1.6, padding: '10px 12px',
                        background: 'rgba(200,168,80,0.06)', border: '1px solid #C8A85020',
                        borderRadius: '5px',
                      }}
                    >
                      演曰：{currentQuestion}
                    </motion.div>
                  </div>
                  <textarea
                    ref={answerRef}
                    value={currentAnswer}
                    onChange={(e) => { setCurrentAnswer(e.target.value); setError(''); }}
                    placeholder="你的回答…（想到什么说什么，不用完美）"
                    rows={2}
                    maxLength={120}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitAnswer(); } }}
                    style={{ ...inputStyle, resize: 'none', marginBottom: '8px' }}
                  />
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                    <button
                      onClick={handleSubmitAnswer}
                      disabled={!currentAnswer.trim()}
                      style={{
                        flex: 1, padding: '8px',
                        background: currentAnswer.trim() ? '#C8A850' : '#5A5040',
                        border: 'none', borderRadius: '4px',
                        color: currentAnswer.trim() ? '#1a1a1a' : '#807870',
                        fontSize: '11px', cursor: currentAnswer.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em',
                      }}
                    >
                      答 ({interviewQA.length + 1}/3)
                    </button>
                    <button
                      onClick={handleRephraseQuestion}
                      style={{
                        padding: '8px 12px', background: 'transparent',
                        border: '1px solid #3A3530', borderRadius: '4px',
                        color: '#8A8070', fontSize: '10px', cursor: 'pointer',
                        fontFamily: '"Noto Serif SC", serif',
                      }}
                    >
                      换个问法
                    </button>
                    <button
                      onClick={handleSkipQuestion}
                      style={{
                        padding: '8px 12px', background: 'transparent',
                        border: '1px solid #3A3530', borderRadius: '4px',
                        color: '#6A6560', fontSize: '10px', cursor: 'pointer',
                        fontFamily: '"Noto Serif SC", serif',
                      }}
                    >
                      跳过
                    </button>
                  </div>
                </>
              ) : null}
              {error && <ErrorTip text={error} />}
            </motion.div>
          )}

          {/* 步骤4: 封印开光 */}
          {step === 3 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <StepHeader title="封印开光" subtitle="演为TA盖下命签" />
              {loading ? (
                <LoadingTip text="演正在提笔落印…" />
              ) : (
                <>
                  {forgedAgent && (
                    <>
                      <div style={{ textAlign: 'center', marginBottom: '18px' }}>
                        <motion.div
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.6, ease: EASE }}
                          style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: `radial-gradient(circle, ${forgedAgent.color}30, transparent)`,
                            border: `1px solid ${forgedAgent.color}60`,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '28px', color: forgedAgent.color, marginBottom: '10px',
                          }}
                        >
                          {forgedAgent.trigram}
                        </motion.div>
                        <div style={{ fontSize: '18px', color: '#F0EDE5', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em' }}>{forgedAgent.name}</div>
                        <div style={{ fontSize: '10px', color: '#9A9488', marginTop: '4px' }}>{forgedAgent.stance} · {forgedAgent.relationLabel}</div>
                      </div>
                      {blessing && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3, duration: 0.5 }}
                          style={{
                            padding: '12px', textAlign: 'center',
                            background: 'rgba(200,168,80,0.08)', border: '1px dashed #C8A85050',
                            borderRadius: '6px', marginBottom: '14px',
                          }}
                        >
                          <div style={{ fontSize: '9px', color: '#C8A850', letterSpacing: '0.2em', marginBottom: '6px' }}>开光评语</div>
                          <div style={{ fontSize: '14px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>{blessing}</div>
                        </motion.div>
                      )}
                      <div style={{ fontSize: '10px', color: '#6A6560', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', marginBottom: '14px' }}>
                        <div style={{ color: '#807870', marginBottom: '4px', letterSpacing: '0.1em' }}>人设</div>
                        {persona}
                      </div>
                      {error && <ErrorTip text={error} />}
                      <StepButtons onBack={canBack ? () => { setStep(2); } : null} onNext={handleStep4Confirm} nextLabel="赐名入营" />
                    </>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* 步骤5: 入营完成 */}
          {step === 4 && (
            <motion.div key="step5" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: EASE }}
              style={{ textAlign: 'center', padding: '20px 0' }}>
              <motion.div
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 12 }}
                style={{ fontSize: '48px', color: '#C8A850', marginBottom: '12px' }}
              >
                {forgedAgent?.trigram || '☯'}
              </motion.div>
              <div style={{ fontSize: '18px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em', marginBottom: '8px' }}>
                {forgedAgent?.name} 入营
              </div>
              <div style={{ fontSize: '11px', color: '#9A9488' }}>{blessing}</div>
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleReturnToSandbox}
                style={{
                  marginTop: '18px', padding: '10px 28px',
                  background: 'rgba(200,168,80,0.1)',
                  border: '1px solid #C8A850', borderRadius: '5px',
                  color: '#F0D890', fontSize: '12px', cursor: 'pointer',
                  fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em',
                  boxShadow: '0 0 12px rgba(200,168,80,0.15)',
                }}
              >
                返回推演
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <button onClick={onClose}
          style={{
            position: 'absolute', top: '14px', right: '14px',
            background: 'transparent', border: 'none', color: '#6A6560',
            fontSize: '20px', cursor: 'pointer', lineHeight: 1,
          }}>
          ×
        </button>
      </motion.div>
    </motion.div>
  );
}

const inputStyle = {
  width: '100%', padding: '9px 12px',
  background: 'rgba(20, 15, 10, 0.8)',
  border: '1px solid #3A3530', borderRadius: '5px',
  color: '#F0EDE5', fontSize: '13px', outline: 'none',
  boxSizing: 'border-box', fontFamily: '"Noto Serif SC", serif',
};

function StepHeader({ title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '18px' }}>
      <div style={{ fontSize: '16px', color: '#F0D890', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.2em' }}>{title}</div>
      <div style={{ fontSize: '10px', color: '#807870', marginTop: '4px', letterSpacing: '0.1em' }}>{subtitle}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: '#A09888', marginBottom: '5px', letterSpacing: '0.1em' }}>{label}</label>
      {children}
    </div>
  );
}

function OptionChip({ active, onClick, color, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
        background: active ? `${color || '#C8A850'}20` : 'rgba(20,15,10,0.6)',
        border: `1px solid ${active ? (color || '#C8A850') : '#3A3530'}`,
        borderRadius: '5px', cursor: 'pointer', color: active ? (color || '#F0D890') : '#9A9488',
      }}
    >
      {children}
    </motion.button>
  );
}

function ErrorTip({ text }) {
  return (
    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
      style={{ color: '#E88080', fontSize: '11px', textAlign: 'center', padding: '6px', background: 'rgba(232,128,128,0.08)', borderRadius: '4px', marginBottom: '10px' }}>
      {text}
    </motion.div>
  );
}

function LoadingTip({ text, compact }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ textAlign: 'center', padding: compact ? '20px 0' : '30px 0', color: '#9A9488', fontSize: '12px' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        style={{ fontSize: compact ? '20px' : '28px', color: '#C8A850', marginBottom: '12px' }}>☯</motion.div>
      <div style={{ letterSpacing: '0.15em' }}>{text}</div>
    </motion.div>
  );
}

function StepButtons({ onBack, onNext, nextLabel, disabled }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
      {onBack && (
        <button onClick={onBack}
          style={{ padding: '9px 16px', background: 'rgba(60,55,50,0.5)', border: '1px solid #3A3530', borderRadius: '5px', color: '#A09888', fontSize: '12px', cursor: 'pointer', fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.1em' }}>
          返回
        </button>
      )}
      <button onClick={onNext} disabled={disabled}
        style={{
          flex: 1, padding: '9px 16px',
          background: disabled ? '#5A5040' : '#C8A850', border: 'none', borderRadius: '5px',
          color: disabled ? '#807870' : '#1a1a1a', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em',
        }}>
        {nextLabel}
      </button>
    </div>
  );
}
