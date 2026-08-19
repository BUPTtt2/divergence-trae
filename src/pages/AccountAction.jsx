import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { resetPassword, verifyEmail } from '../services/accountActions.js';

export default function AccountAction() {
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get('token') || '', [location.search]);
  const verification = location.pathname.endsWith('/verify-email');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState(verification ? 'working' : 'idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!verification) return;
    if (!token) { setStatus('error'); setMessage('验证链接不完整'); return; }
    verifyEmail(token)
      .then(() => { setStatus('success'); setMessage('邮箱已验证，可以返回账号继续使用。'); })
      .catch(() => { setStatus('error'); setMessage('验证链接无效、已使用或已过期。'); });
  }, [token, verification]);

  const submitReset = async () => {
    if (!token) { setStatus('error'); setMessage('重置链接不完整'); return; }
    if (password.length < 10 || password !== confirmation) { setStatus('error'); setMessage('密码至少 10 个字符，并且两次输入必须一致。'); return; }
    setStatus('working');
    try {
      await resetPassword(token, password);
      setStatus('success');
      setMessage('密码已更新，所有旧登录会话已经退出。');
    } catch {
      setStatus('error');
      setMessage('重置链接无效、已使用或已过期。');
    }
  };

  return (
    <main style={{ minHeight: '100dvh', background: '#F2EDE0', color: '#1A1410', display: 'grid', placeItems: 'center', padding: 20 }}>
      <section style={{ width: 'min(440px,100%)', background: '#FAF6EC', border: '1px solid #D9D2C0', padding: 28 }}>
        <div style={{ color: '#A8472E', fontSize: 12, letterSpacing: '.28em' }}>演策 · 账号安全</div>
        <h1 style={{ fontFamily: 'serif', fontSize: 26, margin: '14px 0 8px' }}>{verification ? '验证邮箱' : '重置密码'}</h1>
        <p style={{ color: '#7A7468', fontSize: 12, lineHeight: 1.7 }}>{verification ? '验证链接 24 小时有效且仅可使用一次。' : '重置链接 30 分钟有效且仅可使用一次；完成后其他设备上的旧登录会退出。'}</p>
        {verification ? (
          <p style={{ color: '#7A7468', lineHeight: 1.8 }}>{status === 'working' ? '正在验证…' : message}</p>
        ) : (
          <>
            <label style={{ display: 'grid', gap: 6, marginTop: 20, fontSize: 13 }}>新密码
              <input type="password" minLength={10} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ minHeight: 44, padding: '0 12px', border: '1px solid #D9D2C0', background: '#F2EDE0' }} />
            </label>
            <label style={{ display: 'grid', gap: 6, marginTop: 14, fontSize: 13 }}>再次输入
              <input type="password" minLength={10} maxLength={128} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} style={{ minHeight: 44, padding: '0 12px', border: '1px solid #D9D2C0', background: '#F2EDE0' }} />
            </label>
            <button type="button" onClick={submitReset} disabled={status === 'working' || status === 'success'} style={{ width: '100%', minHeight: 44, marginTop: 18, border: 0, background: '#1A1410', color: '#FAF6EC' }}>{status === 'working' ? '处理中…' : '更新密码'}</button>
            {message && <p style={{ color: status === 'success' ? '#456B54' : '#A8472E', fontSize: 12, lineHeight: 1.7 }}>{message}</p>}
          </>
        )}
        <Link to="/" style={{ display: 'inline-block', marginTop: 18, color: '#A8472E', fontSize: 12 }}>返回首页</Link>
      </section>
    </main>
  );
}
