import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GOLD = '#C8A850';
const RUST = '#A8472E';
const PAPER = '#F0EDE5';

const SECTIONS = [
  { key: 'question', label: '核心问题', icon: '❓', required: true, placeholder: '一句话描述你在纠结什么…' },
  { key: 'branchA', label: '选项 A', icon: '🅰️', required: true, placeholder: '方向A是…' },
  { key: 'branchB', label: '选项 B', icon: '🅱️', required: false, placeholder: '方向B是…（没有就空着）' },
  { key: 'timePressure', label: '时间压力/截止', icon: '⏳', required: true, placeholder: '什么时候必须做决定？拖了代价多少？' },
  { key: 'maxCost', label: '最坏能承受的代价', icon: '💰', required: true, placeholder: '金钱/时间/关系/名誉…最坏情况损失到哪条线你会止损？' },
  { key: 'people', label: '关键人物/影响面', icon: '👥', required: true, placeholder: '谁会被影响？谁有否决权？谁的意见你必须参考？' },
  { key: 'values', label: '价值观优先级（用 > 分隔）', icon: '⚖️', required: false, placeholder: '例：安全感 > 成长 > 自由' },
];

export default function CaseFilePanel({
  caseFile,
  keywords = [],
  historyCards = [],
  bioL2 = '',
  onConfirm,
  onBack,
}) {
  const [form, setForm] = useState(() => ({
    question: caseFile?.question || '',
    branchA: caseFile?.branchA || '',
    branchB: caseFile?.branchB || '',
    timePressure: caseFile?.timePressure || '',
    maxCost: caseFile?.maxCost || '',
    people: caseFile?.people || '',
    values: (caseFile?.values || []).join(' > '),
    knownFacts: caseFile?.knownFacts || [],
  }));

  const facts = useMemo(() => (Array.isArray(form.knownFacts) ? form.knownFacts : []), [form.knownFacts]);

  const missingRequired = SECTIONS.filter(s => s.required && !String(form[s.key] || '').trim()).map(s => s.label);
  const canConfirm = missingRequired.length === 0;

  const updateField = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const finalValues = String(form.values || '')
    .split(/[>、,，\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const handleConfirm = () => {
    if (typeof onConfirm !== 'function') return;
    onConfirm({
      ...(caseFile || {}),
      question: form.question.trim(),
      branchA: form.branchA.trim(),
      branchB: form.branchB.trim(),
      timePressure: form.timePressure.trim(),
      maxCost: form.maxCost.trim(),
      people: form.people.trim(),
      values: finalValues,
      gates: {
        branch_clear: !!(form.branchA.trim()),
        time_clear: form.timePressure.trim().length >= 2,
        cost_clear: form.maxCost.trim().length >= 2,
        people_clear: form.people.trim().length >= 2,
      },
      confirmedByUser: true,
      missingInfo: [],
      editedAt: new Date().toISOString(),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      style={{
        width: '100%',
        maxWidth: '680px',
        padding: '22px 26px',
        background: 'linear-gradient(180deg, rgba(26,20,16,0.98), rgba(26,20,16,0.96))',
        border: `1px solid ${GOLD}40`,
        borderTop: `3px solid ${GOLD}80`,
        boxShadow: `0 8px 40px ${GOLD}15, inset 0 0 0 1px ${GOLD}05`,
        fontFamily: '"Noto Serif SC", serif',
        color: PAPER,
      }}
    >
      <div style={{
        fontSize: '11px',
        color: GOLD,
        letterSpacing: '0.35em',
        marginBottom: '4px',
        textAlign: 'center',
      }}>
        案 · 件 · 档 · 案 · 确 · 认
      </div>
      <div style={{
        fontSize: '9px',
        color: '#8A847A',
        letterSpacing: '0.15em',
        marginBottom: '18px',
        textAlign: 'center',
      }}>
        这是所有智囊看到的唯一事实来源 —— 请你先确认/修改准确，不要嫌麻烦
      </div>

      {/* 档案字段区 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '10px 14px',
        marginBottom: '16px',
      }}>
        {SECTIONS.map(sec => {
          const val = form[sec.key] || '';
          const isFullWidth = sec.key === 'question' || sec.key === 'values';
          const requiredStar = sec.required ? <span style={{ color: RUST, marginLeft: '2px' }}>*</span> : null;
          return (
            <div key={sec.key} style={isFullWidth ? { gridColumn: '1 / -1' } : {}}>
              <div style={{
                fontSize: '9px',
                color: sec.required && !val.trim() ? RUST : `${GOLD}C0`,
                letterSpacing: '0.15em',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <span>{sec.icon}</span>
                <span>{sec.label}</span>
                {requiredStar}
              </div>
              <textarea
                value={val}
                onChange={(e) => updateField(sec.key, e.target.value)}
                placeholder={sec.placeholder}
                rows={sec.key === 'question' ? 2 : 1}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '10px',
                  color: PAPER,
                  lineHeight: 1.55,
                  background: 'rgba(0,0,0,0.3)',
                  border: `1px solid ${sec.required && !val.trim() ? `${RUST}60` : `${GOLD}20`}`,
                  borderRadius: '2px',
                  outline: 'none',
                  fontFamily: '"Noto Serif SC", serif',
                  resize: sec.key === 'question' ? 'vertical' : 'vertical',
                  minHeight: sec.key === 'question' ? '44px' : '30px',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* 已确认的事实历史区 */}
      {facts.length > 0 && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 12px',
          background: 'rgba(200,168,80,0.04)',
          border: `1px solid ${GOLD}15`,
        }}>
          <div style={{
            fontSize: '9px',
            color: GOLD,
            letterSpacing: '0.2em',
            marginBottom: '6px',
          }}>🧾 本轮对话中你已确认的事实</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {facts.slice(0, 10).map(f => (
              <div key={f.id} style={{
                padding: '4px 6px',
                fontSize: '9px',
                color: '#B8B0A4',
                lineHeight: 1.5,
                borderLeft: `2px solid ${GOLD}40`,
              }}>
                <span style={{ color: '#8A847A' }}>Q. {f.question?.slice(0, 30)}</span>
                <span style={{ marginLeft: '6px', color: PAPER }}>→ {f.answer?.slice(0, 60)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* L1历史相似卡片+L2传记（提示） */}
      <AnimatePresence>
        {(historyCards.length > 0 || bioL2) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            style={{
              marginBottom: '16px',
              padding: '8px 10px',
              background: 'rgba(104,88,136,0.06)',
              border: `1px solid #68588825`,
              fontSize: '9px',
              color: '#A89F90',
              lineHeight: 1.6,
            }}
          >
            {bioL2 && (
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#A898C8', letterSpacing: '0.15em' }}>📜 关于你（传记常驻记忆）：</span>
                <div style={{ paddingLeft: '6px', marginTop: '2px', color: '#B8B0A4' }}>
                  {bioL2.slice(0, 200)}{bioL2.length > 200 ? '…' : ''}
                </div>
              </div>
            )}
            {historyCards.length > 0 && (
              <div>
                <div style={{ color: '#A898C8', letterSpacing: '0.15em' }}>🗂️ 你之前的相似命牌：</div>
                {historyCards.slice(0, 2).map((c, i) => (
                  <div key={i} style={{ paddingLeft: '6px', marginTop: '2px', color: '#B8B0A4' }}>
                    · {new Date(c.savedAt || Date.now()).toLocaleDateString()} 问「{(c.question || '').slice(0, 22)}」选了「{c.choiceLabel || ''}」
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 必填缺项提示 */}
      {missingRequired.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: '14px',
            padding: '6px 10px',
            background: `rgba(168,71,46,0.12)`,
            border: `1px solid ${RUST}40`,
            fontSize: '9px',
            color: RUST,
            lineHeight: 1.5,
          }}
        >
          ⚠️ 还缺必填项：{missingRequired.join('、')}——智囊没有这些信息，分析会不准
        </motion.div>
      )}

      {/* 关键词标签 */}
      {keywords.length > 0 && (
        <div style={{
          marginBottom: '14px',
          display: 'flex',
          gap: '5px',
          flexWrap: 'wrap',
        }}>
          {keywords.map(k => (
            <span key={k} style={{
              padding: '2px 8px',
              fontSize: '8px',
              letterSpacing: '0.15em',
              background: `${GOLD}10`,
              border: `1px solid ${GOLD}25`,
              color: `${GOLD}D0`,
            }}>#{k}</span>
          ))}
        </div>
      )}

      {/* 底部按钮 */}
      <div style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        marginTop: '6px',
      }}>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBack}
          style={{
            flex: 1,
            padding: '9px 10px',
            background: 'transparent',
            color: '#8A847A',
            border: `1px solid #5A555040`,
            fontSize: '10px',
            fontFamily: '"Ma Shan Zheng", serif',
            letterSpacing: '0.2em',
            cursor: 'pointer',
            borderRadius: '2px',
          }}
        >
          ⟲ 回 去 再 想 想
        </motion.button>

        <motion.button
          whileHover={canConfirm ? { scale: 1.02 } : {}}
          whileTap={canConfirm ? { scale: 0.98 } : {}}
          onClick={handleConfirm}
          disabled={!canConfirm}
          style={{
            flex: 1.4,
            padding: '9px 10px',
            background: canConfirm
              ? `linear-gradient(135deg, ${GOLD}50, ${RUST}40)`
              : `linear-gradient(135deg, #5A555020, #5A555015)`,
            color: canConfirm ? PAPER : '#6A6560',
            border: `1px solid ${canConfirm ? GOLD : '#5A555040'}`,
            fontSize: '11px',
            fontFamily: '"Ma Shan Zheng", serif',
            letterSpacing: '0.3em',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            borderRadius: '2px',
            boxShadow: canConfirm ? `0 0 16px ${GOLD}20` : 'none',
          }}
        >
          ✓ 确 认 档 案 · 召 唤 智 囊
        </motion.button>
      </div>
    </motion.div>
  );
}
