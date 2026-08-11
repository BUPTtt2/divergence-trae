import { AnimatePresence, motion } from 'framer-motion';
import './liveBaguaArena.css';

const KIND_LABEL = Object.freeze({
  fact: '已确认事实', unknown: '仍待确认', evidence: '工具证据',
  advisor: '智囊席位', interjection: '你的补充', conclusion: '当前共识',
});

export default function ArenaHud({ view, selectedNode, onClose, directResult, onDirectChoice, processingNarrative }) {
  void processingNarrative;
  return (
    <div className="arena-hud" aria-live="polite">
      {directResult && (
        <motion.section className="arena-hud__direct" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <small>{directResult.lane === 'safety' ? '安全优先' : directResult.lane === 'lightweight' ? '轻量判断' : '直接解答'}</small>
          {directResult.routeSummary && <strong className="arena-hud__route-summary">{directResult.routeSummary}</strong>}
          <p>{directResult.answer}</p>
          {directResult.quickChoices?.length > 0 && (
            <div>{directResult.quickChoices.map((choice) => (
              <button key={choice.id || choice.label || choice} type="button" onClick={() => onDirectChoice?.(choice)}>{choice.label || choice}</button>
            ))}</div>
          )}
        </motion.section>
      )}

      <AnimatePresence>
        {selectedNode && (
          <motion.aside
            className="arena-hud__inspector"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
          >
            <button type="button" onClick={onClose} aria-label="关闭节点详情">×</button>
            <small>{KIND_LABEL[selectedNode.kind] || '推演节点'}</small>
            <h3>{selectedNode.label}</h3>
            <p>{selectedNode.detail}</p>
            <footer><span>{selectedNode.source}</span>{selectedNode.status && <em>{selectedNode.status}</em>}</footer>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
