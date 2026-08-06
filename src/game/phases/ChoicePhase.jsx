import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ChoiceHud from '../../components/board/ChoiceHud';

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

export default function ChoicePhase({
  phase,
  choices,
  inference,
  setSelectedChoice,
  selectedChoice,
  fateContent,
  BORDER_COLOR,
  GLOW_COLOR,
  DEFAULT_CHOICES,
  currentCommit,
  setCurrentCommit,
  awaitingUser,
  oracleResult,
  oracleThrowing,
  setOracleResult,
  setOracleThrowing,
  setPhase,
  setAgentDialogues,
  setInference,
  setAwaitingUser,
  showFloatTip,
  setShowQuestion,
  setFateContent,
  userInput,
  agentDialogues,
  activeAgents,
}) {
  const computedChoices = useMemo(() => {
    if (choices && choices.length > 0) return choices;
    const agentCount = activeAgents?.length || 0;
    if (agentCount <= 2) return DEFAULT_CHOICES.slice(0, 3);
    if (agentCount >= 5) return DEFAULT_CHOICES;
    return DEFAULT_CHOICES.slice(0, 3);
  }, [choices, activeAgents]);

  const handleChoiceClick = async (choice) => {
    setSelectedChoice(choice);
    setPhase('path_reveal');
    setAwaitingUser(false);
    setFateContent(null);

    setAgentDialogues(prev => {
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

    try {
      const { generatePersonalizedCardContent } = await import('../../services/inferenceEngine');
      const realGua = inference?.gua;
      const guaName = realGua?.gua || choice.gua || '大有';
      const trigram = realGua?.trigram || choice.icon || '☰';
      const personalized = await generatePersonalizedCardContent({
        question: userInput,
        guaName,
        choiceLabel: choice.label,
        agentDialogues: inference?.agentDialogues || {},
        trigram,
      });
      setFateContent(personalized);
    } catch (e) {
      console.warn('[命牌生成] 失败, 降级:', e.message);
      setFateContent({ verse: inference?.verse || choice.gua || '', summary: '', source: 'preset' });
    }

    setTimeout(() => {
      setAwaitingUser(true);
    }, 4500);
  };

  const handleStartOracle = useCallback(() => {
    setPhase('oracle');
    setOracleThrowing(true);
    setOracleResult(null);
    setAwaitingUser(false);
    setTimeout(() => {
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
  }, [setPhase, setOracleThrowing, setOracleResult, setAwaitingUser, setInference, setAgentDialogues]);

  const handleProceedToChoices = useCallback(() => {
    setPhase('path_reveal');
    setAgentDialogues(prev => ({
      ...prev,
      yan: '卦已成,天光已借。\n分岔在前,请选择你的路径。',
      history: { ...(prev.history || {}), yan: [...((prev.history || {}).yan || []), '卦已成,天光已借。分岔在前,请选择你的路径。'] },
    }));
  }, [setPhase, setAgentDialogues]);

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
  }, [setPhase, setAgentDialogues]);

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
  }, [currentCommit, setAgentDialogues, setPhase, setCurrentCommit]);

  const handleRevealFate = useCallback(() => {
    setAwaitingUser(false);
    setPhase('final');
  }, [setAwaitingUser, setPhase]);

  return (
    <>
      <ChoiceHud
        phase={phase}
        choices={computedChoices}
        onClick={handleChoiceClick}
        selectedChoice={selectedChoice}
      />

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
                      background: `radial-gradient(circle at 28% 22%, #F5E6C8 0%, #E8D098 30%, #C49A5C 65%, #8A6A30 100%)`,
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
                    background: `linear-gradient(135deg, #A8472E 0%, #8A3925 100%)`,
                    color: '#FAF6EC',
                    borderRadius: 2,
                    boxShadow: '0 4px 24px rgba(168, 71, 46, 0.5)',
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
        {awaitingUser && phase === 'path_reveal' && selectedChoice && (
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
    </>
  );
}