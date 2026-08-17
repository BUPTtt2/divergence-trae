import { useState } from 'react';
import { submitDecisionFeedback } from '../../services/feedbackClient.js';
import './decisionFeedback.css';

const HELP_OPTIONS = [
  { value: 'helpful', label: '有帮助' },
  { value: 'neutral', label: '一般' },
  { value: 'unhelpful', label: '没帮助' },
];

const TAG_OPTIONS = [
  ['missed_point', '问题没问到点'],
  ['repetitive_advisors', '智囊有重复'],
  ['generic_conclusion', '结论太泛'],
  ['too_slow', '等待太久'],
  ['unclear_controls', '操作不清楚'],
  ['destiny_card', '命牌体验'],
  ['other', '其他'],
];

export default function DecisionFeedback({ sessionId }) {
  const [helpfulness, setHelpfulness] = useState('');
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState('idle');

  const toggleTag = (tag) => {
    setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
    if (status === 'saved') setStatus('idle');
  };

  const submit = async () => {
    if (!sessionId || !helpfulness || status === 'saving') return;
    setStatus('saving');
    try {
      await submitDecisionFeedback(sessionId, { helpfulness, tags, comment });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="decision-feedback" aria-labelledby="decision-feedback-title">
      <header>
        <small>回批 · 仅产品负责人可见</small>
        <h3 id="decision-feedback-title">这次推演对你有帮助吗？</h3>
      </header>
      <div className="decision-feedback__helpfulness">
        {HELP_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            aria-pressed={helpfulness === option.value}
            onClick={() => { setHelpfulness(option.value); if (status === 'saved') setStatus('idle'); }}
          >{option.label}</button>
        ))}
      </div>
      {helpfulness && helpfulness !== 'helpful' && <fieldset>
        <legend>哪里最需要改进？可多选</legend>
        <div>{TAG_OPTIONS.map(([value, label]) => (
          <label key={value}><input type="checkbox" checked={tags.includes(value)} onChange={() => toggleTag(value)} />{label}</label>
        ))}</div>
      </fieldset>}
      {helpfulness && <label className="decision-feedback__comment">
        <span>还想告诉我们什么？（可不填）</span>
        <textarea
          value={comment}
          onChange={(event) => { setComment(event.target.value.slice(0, 800)); if (status === 'saved') setStatus('idle'); }}
          maxLength={800}
          placeholder="请勿填写姓名、联系方式或敏感决策信息。"
        />
      </label>}
      {helpfulness && <footer>
        <button type="button" onClick={submit} disabled={status === 'saving'}>
          {status === 'saving' ? '正在递交…' : status === 'saved' ? '已收到' : status === 'error' ? '重试反馈' : '递交回批'}
        </button>
        <span role="status">{status === 'saved' ? '已收到，只用于改进演策。' : status === 'error' ? '暂未送达，不影响本局记录。' : ''}</span>
      </footer>}
    </section>
  );
}
