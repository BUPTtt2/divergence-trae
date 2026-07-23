/**
 * 智囊铸造 - 5步严谨向导
 * 步骤1: 赐名 + 描述
 * 步骤2: 演理解语境 → 选关系 + 选视角
 * 步骤3: 演递进审问 → 用户答3问
 * 步骤4: 封印开光 → 生成评语
 * 步骤5: 入营
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  validateAgentName,
  validateAgentDesc,
  saveCustomAgent,
  understandNameContext,
  generateInterviewQuestionsByContext,
  refinePersonaWithInterview,
  generateSealingBlessing,
  forgeAgent,
  RELATION_OPTIONS,
  PERSPECTIVE_OPTIONS,
} from '../utils/customAgent';

const EASE = [0.16, 1, 0.3, 1];

const STEP_LABELS = ['赐名', '定关系', '演审问', '封印', '入营'];

export default function AgentCreator({ onClose, onSaved, existingAgents = [] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 步骤2状态
  const [contextSummary, setContextSummary] = useState('');
  const [relation, setRelation] = useState('');
  const [perspective, setPerspective] = useState('');
  const [conversationId, setConversationId] = useState(null);

  // 步骤3状态
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState(['', '', '']);

  // 步骤4状态
  const [persona, setPersona] = useState('');
  const [blessing, setBlessing] = useState('');
  const [forgedAgent, setForgedAgent] = useState(null);
  const [source, setSource] = useState('local');

  const handleStep1Next = async () => {
    setError('');
    const nameCheck = validateAgentName(name, existingAgents);
    if (!nameCheck.valid) { setError(nameCheck.message); return; }
    const descCheck = validateAgentDesc(desc);
    if (!descCheck.valid) { setError(descCheck.message); return; }

    setStep(1);
    setLoading(true);
    try {
      const result = await understandNameContext(name, desc, conversationId);
      setContextSummary(result.summary);
      if (result.relationGuess) {
        const match = RELATION_OPTIONS.find(r => r.label === result.relationGuess || r.id === result.relationGuess);
        if (match) setRelation(match.id);
      }
      if (result.conversationId) setConversationId(result.conversationId);
      setSource(result.source);
    } catch (e) {
      setContextSummary(`「${name}」是用户要邀请入营的智囊。`);
    } finally {
      setLoading(false);
    }
  };

  const handleStep2Next = async () => {
    if (!relation) { setError('请选择「${name}」与你的关系'); return; }
    if (!perspective) { setError('请选择这位智囊的主视角'); return; }
    setError('');
    setStep(2);
    setLoading(true);
    try {
      const result = await generateInterviewQuestionsByContext(name, relation, perspective, conversationId);
      setQuestions(result.questions);
      if (result.conversationId) setConversationId(result.conversationId);
      setSource(result.source);
    } catch (e) {
      setQuestions([
        `「${name}」最擅长在什么场景下发言？`,
        `「${name}」说话的风格是什么？`,
        `「${name}」最大的盲点是什么？`,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleStep3Next = async () => {
    const validAnswers = answers.filter(a => a && a.trim());
    if (validAnswers.length === 0) {
      setError('至少回答一问，演才能为TA塑形');
      return;
    }
    setError('');
    setStep(3);
    setLoading(true);
    try {
      const personaResult = await refinePersonaWithInterview(name, relation, perspective, contextSummary, answers, conversationId);
      setPersona(personaResult.persona);
      if (personaResult.conversationId) setConversationId(personaResult.conversationId);

      // 用 forgeAgent 先生成基础智囊，再生成开光评语
      const agent = forgeAgent({
        name, desc, relation, perspective,
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

  const handleStep4Confirm = () => {
    if (!forgedAgent) return;
    const saved = saveCustomAgent(forgedAgent);
    if (saved) {
      setStep(4);
      setTimeout(() => {
        onSaved?.(saved);
        onClose?.();
      }, 1800);
    } else {
      setError('入营失败，请重试');
    }
  };

  const canBack = step > 0 && step < 4 && !loading;

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
          width: 'min(480px, 92vw)',
          maxHeight: '88vh', overflow: 'auto',
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
                  placeholder="如：钱谷、镜渊、宝宝…" maxLength={6}
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
                    <div style={{ padding: '10px 12px', background: 'rgba(200,168,80,0.06)', border: '1px solid #C8A85030', borderRadius: '6px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '10px', color: '#C8A850', marginBottom: '4px', letterSpacing: '0.15em' }}>演的理解</div>
                      <div style={{ fontSize: '12px', color: '#D8D0C0', lineHeight: 1.6 }}>{contextSummary}</div>
                      {source === 'local' && <div style={{ fontSize: '9px', color: '#6A6560', marginTop: '4px' }}>(本地推断)</div>}
                    </div>
                  )}
                  <Field label="TA与你的关系">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {RELATION_OPTIONS.map(r => (
                        <OptionChip key={r.id} active={relation === r.id} onClick={() => { setRelation(r.id); setError(''); }}>
                          <span style={{ fontSize: '14px' }}>{r.icon}</span>
                          <span style={{ fontSize: '10px' }}>{r.label}</span>
                        </OptionChip>
                      ))}
                    </div>
                  </Field>
                  <Field label="TA的主视角">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                      {PERSPECTIVE_OPTIONS.map(p => (
                        <OptionChip key={p.id} active={perspective === p.id} onClick={() => { setPerspective(p.id); setError(''); }} color={p.color}>
                          <span style={{ fontSize: '14px' }}>{p.icon}</span>
                          <span style={{ fontSize: '9px' }}>{p.label}</span>
                        </OptionChip>
                      ))}
                    </div>
                  </Field>
                  {error && <ErrorTip text={error} />}
                  <StepButtons onBack={canBack ? () => setStep(0) : null} onNext={handleStep2Next} nextLabel="演来审问" disabled={!relation || !perspective} />
                </>
              )}
            </motion.div>
          )}

          {/* 步骤3: 演审问 */}
          {step === 2 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
              <StepHeader title="演之审问" subtitle="三问递进，塑TA之魂" />
              {loading ? (
                <LoadingTip text="演正在拟审问之辞…" />
              ) : (
                <>
                  {questions.map((q, i) => (
                    <Field key={i} label={`第${i + 1}问`}>
                      <div style={{ fontSize: '12px', color: '#F0D890', marginBottom: '6px', lineHeight: 1.5, fontStyle: 'italic' }}>{q}</div>
                      <textarea value={answers[i]} onChange={(e) => { const next = [...answers]; next[i] = e.target.value; setAnswers(next); setError(''); }}
                        placeholder="你的回答…" rows={2} maxLength={100}
                        style={{ ...inputStyle, resize: 'none' }} />
                    </Field>
                  ))}
                  {error && <ErrorTip text={error} />}
                  <StepButtons onBack={canBack ? () => setStep(1) : null} onNext={handleStep3Next} nextLabel="封印开光" disabled={!answers.some(a => a.trim())} />
                </>
              )}
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
                      <StepButtons onBack={canBack ? () => setStep(2) : null} onNext={handleStep4Confirm} nextLabel="赐名入营" />
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
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
                style={{ fontSize: '10px', color: '#6A6560', marginTop: '16px', letterSpacing: '0.15em' }}
              >
                正在返回智囊阁…
              </motion.div>
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

function LoadingTip({ text }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ textAlign: 'center', padding: '30px 0', color: '#9A9488', fontSize: '12px' }}>
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        style={{ fontSize: '28px', color: '#C8A850', marginBottom: '12px' }}>☯</motion.div>
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
          color: '#1a1a1a', fontSize: '12px', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: '"Ma Shan Zheng", serif', letterSpacing: '0.15em',
        }}>
        {nextLabel}
      </button>
    </div>
  );
}
