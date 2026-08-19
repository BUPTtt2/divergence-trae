import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { submitGeneralFeedback } from '../../services/feedbackClient.js';
import './feedbackDialog.css';

const CATEGORIES = [
  { value: 'bug', label: '遇到问题' },
  { value: 'idea', label: '功能建议' },
  { value: 'confusing', label: '看不明白' },
  { value: 'other', label: '其他反馈' },
];

function createIdempotencyKey() {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const openedAt = useRef(0);
  const idempotencyKey = useRef(createIdempotencyKey());

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener('yance:open-feedback', show);
    return () => window.removeEventListener('yance:open-feedback', show);
  }, []);

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) {
      openedAt.current = Date.now();
      setState('idle');
      setError('');
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (cleanMessage.length < 4) {
      setError('请至少写 4 个字，让我们知道具体发生了什么。');
      return;
    }
    setState('sending');
    setError('');
    try {
      await submitGeneralFeedback({
        category,
        message: cleanMessage,
        email,
        page: `${window.location.pathname}${window.location.search}`,
        website,
        interactionMs: Date.now() - openedAt.current,
      }, { idempotencyKey: idempotencyKey.current });
      setState('success');
      setMessage('');
      setEmail('');
      idempotencyKey.current = createIdempotencyKey();
    } catch (submitError) {
      setState('error');
      setError(submitError.status === 429 ? '提交有点频繁，请稍后再试。' : '暂时没有送达。内容还在，请稍后重试。');
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="feedback-overlay" />
        <Dialog.Content className="feedback-dialog" aria-describedby="feedback-description">
          <Dialog.Close className="feedback-dialog__close" aria-label="关闭反馈窗口">×</Dialog.Close>
          {state === 'success' ? (
            <div className="feedback-dialog__success">
              <span aria-hidden="true">已收到</span>
              <Dialog.Title>谢谢你把问题说出来。</Dialog.Title>
              <Dialog.Description id="feedback-description">这条反馈已经进入运营后台。需要回复时，我们会通过你留下的邮箱联系。</Dialog.Description>
              <Dialog.Close className="feedback-dialog__submit">完成</Dialog.Close>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Dialog.Title>反馈给演策</Dialog.Title>
              <Dialog.Description id="feedback-description">只提交你主动填写的内容，不会自动附带问题正文或推演记录。</Dialog.Description>
              <fieldset className="feedback-dialog__categories">
                <legend>反馈类型</legend>
                {CATEGORIES.map((item) => (
                  <label key={item.value}>
                    <input type="radio" name="feedback-category" value={item.value} checked={category === item.value} onChange={() => setCategory(item.value)} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="feedback-dialog__field">
                <span>具体情况</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={800} rows={6} placeholder="你做了什么、期望发生什么、实际发生了什么？" />
                <small>{message.length} / 800</small>
              </label>
              <label className="feedback-dialog__field">
                <span>联系邮箱（选填）</span>
                <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" placeholder="用于需要进一步确认时回复你" />
              </label>
              <label className="feedback-dialog__trap" aria-hidden="true">
                <span>网站</span><input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
              {error && <p className="feedback-dialog__error" role="alert">{error}</p>}
              <button className="feedback-dialog__submit" type="submit" disabled={state === 'sending'}>{state === 'sending' ? '正在提交' : '提交反馈'}</button>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
