/**
 * P1: 澄清对话弹窗（演问浮层）
 * 信息不足时（informationCompleteness < 0.6），先问用户澄清问题
 * 用户回答后，答案追加到原问题，让后续推演有更完整的信息
 *
 * Step 4 增量改造（基于现有组件，不破坏 framer-motion 动画/分步交互/跳过提交流程）：
 *  1. 标题改"天机不全·演问" + 按 source 显示副标题
 *  2. 加开场吊言区（openingLine）
 *  3. 加卦位缺角指示器（基于 dimensions，纯CSS）
 *  4. 加 round 指示
 *  5. textarea 卜筹化（样式微调）
 *  新 props 全部可选（有默认值），兼容旧调用。
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sanitizeLLMText } from '../utils/helpers';

// 八卦 perspective 映射（REAL_AGENT_ARCHITECTURE.md 5.2节）
const HEXAGRAM_MAP = {
  strategic: '☰乾',
  communication: '☱兑',
  emotional: '☲离',
  action: '☳震',
  experience: '☴巽',
  risk: '☵坎',
  practical: '☶艮',
  health: '☷坤',
};
const HEXAGRAM_ORDER = [
  'strategic', 'communication', 'emotional', 'action',
  'experience', 'risk', 'practical', 'health',
];

// source → 副标题文案
const SOURCE_SUBTITLE = {
  P0: '演需要更多信息',
  P1: '基于你的命格，再问',
  P2: '有些情况需要你确认',
  P3: '推演缺少关键信息',
  P4: '基于你的历史，有问',
};

const FONT_FAMILY_CN = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export default function ClarifyDialog({
  questions,
  currentIdx = 0,
  onSubmit,
  onSkip,
  // Step4 新增可选 props（有默认值，兼容旧调用）
  round,
  maxRound,
  openingLine = '',
  analysis = '',
  dimensions = [],
  // REQ1 新增：对话助手长上下文模式（默认 false → 全屏弹窗，true → 内嵌侧边栏卡片）
  inline = false,
}) {
  // P0-1 修复：分点排列，所有问题一起显示（不再分步一个一个问）
  const [answers, setAnswers] = useState(() => {
    const init = {};
    (questions || []).forEach((_, i) => { init[i] = ''; });
    return init;
  });

  if (!questions || questions.length === 0) return null;

  const allCount = questions.length;
  const answeredCount = Object.values(answers).filter(v => v && String(v).trim()).length;
  const canSubmit = answeredCount >= 1;  // 至少回答1个就能提交，不强求全答

  // 兼容旧字符串格式与新对象格式 {question, reason, source}
  const normalizeQ = (q) => {
    if (typeof q === 'string') return { question: q, reason: '', source: null };
    return { question: q?.question || '', reason: q?.reason || '', source: q?.source || null };
  };

  const handleSubmitAll = () => {
    // 清理空答案，但保留已答索引对应关系
    const trimmed = {};
    Object.keys(answers).forEach(k => {
      const v = (answers[k] || '').trim();
      if (v) trimmed[k] = v;
    });
    onSubmit(trimmed);
  };

  const handleSkip = () => {
    onSkip();
  };

  // 卦位缺角：已覆盖的 perspective 集合
  const coveredPerspectives = new Set(
    (dimensions || []).map(d => d?.perspective).filter(Boolean)
  );

  const subtitle = '演需要这些信息，才能更准地推卦';

  // REQ1: 内层卡片的样式（两种模式公用）
  const cardStyle = inline
    ? {
        width: '100%',
        background: 'linear-gradient(160deg, #1a1520 0%, #14101a 100%)',
        border: '1px solid rgba(200, 168, 80, 0.28)',
        borderRadius: '14px',
        padding: '22px 18px',
        fontFamily: FONT_FAMILY_CN,
      }
    : {
        width: 'min(640px, 94vw)',
        maxHeight: '90vh',
        overflowY: 'auto',
        background: 'linear-gradient(160deg, #1a1520 0%, #14101a 100%)',
        border: '1px solid rgba(200, 168, 80, 0.28)',
        borderRadius: '16px',
        padding: '32px 28px',
        boxShadow: '0 24px 72px rgba(0,0,0,0.55)',
        fontFamily: FONT_FAMILY_CN,
      };

  // REQ1: 卡片动画（两种模式公用）
  const cardMotionProps = {
    initial: inline ? { opacity: 0, y: 16 } : { opacity: 0, y: 30, scale: 0.95 },
    animate: inline ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 },
    exit: inline ? { opacity: 0, y: 8 } : { opacity: 0, y: 30, scale: 0.95 },
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  };

  // REQ1: 长对话模式下，外层不用固定遮罩弹窗，直接包一个AnimatePresence+卡片
  if (inline) {
    return (
      <AnimatePresence>
        <motion.div key={`clarify-inline-${round || 0}-${(questions || []).length}`} {...cardMotionProps} style={cardStyle}>
          <ClarifyCardContent
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            round={round}
            maxRound={maxRound}
            openingLine={openingLine}
            subtitle={subtitle}
            dimensions={dimensions}
            answeredCount={answeredCount}
            allCount={allCount}
            canSubmit={canSubmit}
            onSubmit={handleSubmitAll}
            onSkip={handleSkip}
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  // 原模式：全屏遮罩弹窗
  return (
    <AnimatePresence>
      <motion.div
        key={`clarify-modal-${round || 0}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10, 8, 15, 0.90)',
          backdropFilter: 'blur(10px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          overflowY: 'auto',
        }}
      >
        <motion.div {...cardMotionProps} style={cardStyle}>
          <ClarifyCardContent
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            round={round}
            maxRound={maxRound}
            openingLine={openingLine}
            subtitle={subtitle}
            dimensions={dimensions}
            answeredCount={answeredCount}
            allCount={allCount}
            canSubmit={canSubmit}
            onSubmit={handleSubmitAll}
            onSkip={handleSkip}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* 抽离出卡片内容组件：避免两套模式代码重复 */
function ClarifyCardContent({
  questions, answers, setAnswers, round, maxRound,
  openingLine, subtitle, dimensions, answeredCount, allCount,
  canSubmit, onSubmit, onSkip,
}) {
  const normalizeQ = (q) => {
    if (typeof q === 'string') return { question: q, reason: '', source: null };
    return { question: q?.question || '', reason: q?.reason || '', source: q?.source || null };
  };
  const coveredPerspectives = new Set(
    (dimensions || []).map(d => d?.perspective).filter(Boolean)
  );

  const handleSubmitAll = () => {
    const trimmed = {};
    Object.keys(answers || {}).forEach(k => {
      const v = ((answers || {})[k] || '').trim();
      if (v) trimmed[k] = v;
    });
    onSubmit(trimmed);
  };
  const handleSkip = () => {
    if (typeof onSkip === 'function') onSkip();
  };

  return (
    <>
      {/* 卦位缺角微抖动 keyframe（纯CSS） */}
      <style>{`
        @keyframes trigramTremor {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.3; }
        }
      `}</style>

          {/* 标题 — 天机不全 · 演问 */}
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{
              fontSize: '12px',
              color: '#C85050',
              letterSpacing: '0.3em',
              marginBottom: '8px',
            }}>
              演 · 追问
            </div>
            <div style={{
              fontSize: '19px',
              color: '#FAF6EC',
              fontFamily: '"Ma Shan Zheng", serif',
              letterSpacing: '0.12em',
            }}>
              {subtitle}
            </div>
            {/* round 指示 */}
            {round != null && maxRound != null && (
              <div style={{ marginTop: '10px' }}>
                <div style={{
                  fontSize: '11px',
                  color: 'rgba(255,255,255,0.45)',
                  letterSpacing: '0.1em',
                }}>
                  第 {round}/{maxRound} 轮 · 演问
                </div>
              </div>
            )}
          </div>

          {/* 开场吊言（openingLine，为空不渲染）— 放在标题后，但**不再额外渲染 analysis**（避免重复/假设用户收入） */}
          {openingLine && (
            <div style={{
              textAlign: 'center',
              color: '#E8D8B0',
              fontFamily: '"Ma Shan Zheng", serif',
              fontSize: '15px',
              lineHeight: 1.7,
              marginBottom: '18px',
              padding: '0 8px',
            }}>
              {sanitizeLLMText(openingLine)}
            </div>
          )}

          {/* 分点排列：所有问题一次性展示 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginBottom: '8px',
          }}>
            {questions.map((q, i) => {
              const nq = normalizeQ(q);
              const tagColor = nq.source === 'P0' ? '#C85050'
                : nq.source === 'P1' ? '#C8A850'
                : nq.source === 'P2' ? '#A880C8'
                : nq.source === 'P3' ? '#80A8C8'
                : nq.source === 'P4' ? '#80C8A0'
                : 'rgba(255,255,255,0.25)';
              return (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(200, 168, 80, 0.15)',
                    borderRadius: '10px',
                    padding: '14px 16px 16px',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    marginBottom: '10px',
                  }}>
                    <div style={{
                      flexShrink: 0,
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: tagColor,
                      color: '#14101a',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      fontFamily: '"Ma Shan Zheng", serif',
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '15px',
                        color: '#E8D8B0',
                        lineHeight: 1.55,
                        fontWeight: 500,
                      }}>
                        {sanitizeLLMText(nq.question)}
                      </div>
                      {nq.reason && (
                        <div style={{
                          marginTop: '5px',
                          fontSize: '11.5px',
                          color: 'rgba(255,255,255,0.38)',
                          lineHeight: 1.5,
                          paddingLeft: '2px',
                        }}>
                          · {sanitizeLLMText(nq.reason)}
                        </div>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={answers[i] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                    placeholder="投字于卜筹……（可以简短回答）"
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.04)',
                      border: answers[i]?.trim()
                        ? '1px solid rgba(200, 168, 80, 0.55)'
                        : '1px solid rgba(200, 168, 80, 0.22)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      color: '#FAF6EC',
                      fontSize: '13.5px',
                      lineHeight: 1.55,
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: FONT_FAMILY_CN,
                      boxShadow: answers[i]?.trim()
                        ? 'inset 0 0 10px rgba(200, 168, 80, 0.12)'
                        : 'inset 0 0 8px rgba(200, 168, 80, 0.05)',
                      transition: 'all 0.2s',
                      minHeight: '54px',
                    }}
                    autoFocus={i === 0}
                  />
                </div>
              );
            })}
          </div>

          {/* 回答进度条 */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '18px',
            marginBottom: '6px',
          }}>
            <div style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: 'rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${allCount > 0 ? (answeredCount / allCount) * 100 : 0}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #C8A850 0%, #E8D090 100%)',
                borderRadius: '2px',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{
              fontSize: '11px',
              color: answeredCount === allCount ? '#80C8A0' : 'rgba(255,255,255,0.4)',
              whiteSpace: 'nowrap',
            }}>
              {answeredCount}/{allCount}
            </div>
          </div>

          {/* 按钮区 */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
          }}>
            <button
              onClick={handleSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '13px',
                cursor: 'pointer',
                padding: '8px 12px',
              }}
            >
              跳过，直接推演
            </button>

            <motion.button
              whileHover={canSubmit ? { scale: 1.03 } : {}}
              whileTap={canSubmit ? { scale: 0.97 } : {}}
              onClick={handleSubmitAll}
              disabled={!canSubmit}
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #C8A850 0%, #A88530 100%)'
                  : 'rgba(255,255,255,0.08)',
                border: 'none',
                color: canSubmit ? '#1a1520' : 'rgba(255,255,255,0.3)',
                fontSize: '14px',
                fontWeight: 600,
                padding: '10px 32px',
                borderRadius: '8px',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                letterSpacing: '0.1em',
              }}
            >
              开始推演 →
            </motion.button>
          </div>

          {/* 提示 */}
          <div style={{
            textAlign: 'center',
            marginTop: '12px',
            fontSize: '11px',
            color: 'rgba(255,255,255,0.25)',
          }}>
            可以跳过不想回答的问题 · 至少回答 1 个即可推演
          </div>
        </>
  );
}
