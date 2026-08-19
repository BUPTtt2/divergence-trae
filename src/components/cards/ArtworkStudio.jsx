import { useCallback, useEffect, useMemo, useState } from 'react';
import { ARTWORK_STYLES, createArtworkStudioState } from '../../game/artworkJobModel.js';
import { createArtworkJob, getArtworkEntitlement, getArtworkVersions, selectArtworkVersion, selectSystemArtwork } from '../../services/apiClient.js';
import tracker from '../../services/tracker.js';
import './artworkStudio.css';

function requestId() {
  return `art-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorCode(error) {
  const text = String(error?.message || '');
  if (text.includes('ARTWORK_CREDIT_REQUIRED')) return 'ARTWORK_CREDIT_REQUIRED';
  if (text.includes('404')) return 'CARD_NOT_SYNCED';
  return 'ARTWORK_REQUEST_FAILED';
}

export default function ArtworkStudio({ card, onClose, onArtworkSelected }) {
  const initial = useMemo(() => createArtworkStudioState(card), [card]);
  const [versions, setVersions] = useState(initial.versions);
  const [selectedStyle, setSelectedStyle] = useState(ARTWORK_STYLES[0].id);
  const [job, setJob] = useState(initial.job);
  const [entitlement, setEntitlement] = useState({ plan: 'free', artworkCredits: 0 });
  const [message, setMessage] = useState('系统典藏画境始终免费可用。每张命牌含一次专属画境生成。');
  const busy = job?.status === 'queued' || job?.status === 'generating';
  const hasIncludedVersion = versions.length > 0;
  const canGenerate = !hasIncludedVersion || entitlement.artworkCredits > 0;

  const load = useCallback(async () => {
    try {
      const [remote, account] = await Promise.all([getArtworkVersions(card.id), getArtworkEntitlement()]);
      setVersions(remote);
      setEntitlement(account);
    } catch {
      setMessage('这张命牌尚未同步到云端；系统画境和 PNG 导出仍可正常使用。');
    }
  }, [card.id]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (busy || !canGenerate) return;
    const usesPaidCredit = hasIncludedVersion;
    const startedAt = Date.now();
    const idempotencyKey = requestId();
    setJob({ status: 'generating' });
    setMessage('正在生成专属画境。即使网络中断，已落库的任务状态也不会冒充成功。');
    tracker.track('artwork_job_started', { cardId: card.id, styleId: selectedStyle, includedCredit: !usesPaidCredit });
    try {
      const result = await createArtworkJob(card.id, { styleId: selectedStyle, idempotencyKey });
      setJob(result.job);
      if (result.version) setVersions((current) => current.some((item) => item.id === result.version.id) ? current : [result.version, ...current]);
      const ready = result.job?.status === 'ready';
      if (ready && usesPaidCredit) setEntitlement((current) => ({ ...current, artworkCredits: Math.max(0, current.artworkCredits - 1) }));
      setMessage(ready
        ? result.version?.persistent ? '专属画境已生成并持久保存。请选择后设为当前画境。' : '专属画境已生成。当前为供应商临时地址，请尽快导出保存。'
        : '画境服务本次未成功，免费次数未扣除，可以稍后重试。');
      tracker.track('artwork_job_completed', {
        cardId: card.id, styleId: selectedStyle, success: ready,
        durationMs: Date.now() - startedAt, errorCode: result.job?.errorCode || '',
        persistent: result.version?.persistent === true, includedCredit: !usesPaidCredit,
      });
    } catch (error) {
      const code = errorCode(error);
      setJob({ status: 'failed', errorCode: code });
      setMessage(code === 'ARTWORK_CREDIT_REQUIRED' ? '本张命牌的一次免费生成已使用；当前没有可用的追加画境积分。' : '专属画境暂时不可用，系统画境不受影响；积分不会被扣除。');
      tracker.track('artwork_job_completed', { cardId: card.id, styleId: selectedStyle, success: false, durationMs: Date.now() - startedAt, errorCode: code, includedCredit: !usesPaidCredit });
    }
  };

  const chooseVersion = async (version) => {
    try {
      const result = await selectArtworkVersion(card.id, version.id);
      setVersions((current) => current.map((item) => ({ ...item, selected: item.id === version.id })));
      setMessage('已设为当前专属画境。命牌与导出图将使用这个版本。');
      tracker.track('artwork_version_selected', { cardId: card.id, styleId: version.styleId, persistent: version.persistent === true });
      onArtworkSelected?.(result.version);
    } catch {
      setMessage('切换失败，当前画境没有被改动。');
    }
  };

  const chooseSystem = async () => {
    try {
      await selectSystemArtwork(card.id);
      setVersions((current) => current.map((item) => ({ ...item, selected: false })));
      setMessage('已恢复系统典藏画境。');
      tracker.track('artwork_version_selected', { cardId: card.id, styleId: 'system', persistent: true });
      onArtworkSelected?.(null);
    } catch {
      setMessage('恢复系统画境失败，当前画境没有被改动。');
    }
  };

  return (
    <div className="artwork-studio-backdrop" role="presentation" onClick={onClose}>
      <section className="artwork-studio" role="dialog" aria-modal="true" aria-labelledby="artwork-studio-title" onClick={(event) => event.stopPropagation()}>
        <header><div><small>DESTINY ARTWORK</small><h2 id="artwork-studio-title">专属画境</h2></div><button type="button" onClick={onClose} aria-label="关闭专属画境">×</button></header>
        <p className="artwork-studio__message" role="status">{message}</p>
        <article className="artwork-studio__system">
          <img src={initial.systemArtwork.url} alt="系统典藏画境预览" />
          <div><strong>系统典藏画境</strong><p>永久免费 · 稳定可导出 · 不消耗生成次数</p><button type="button" onClick={chooseSystem}>使用系统画境</button></div>
        </article>
        <div className="artwork-studio__styles" aria-label="画境风格">
          {ARTWORK_STYLES.map((style) => <button key={style.id} type="button" aria-pressed={selectedStyle === style.id} onClick={() => setSelectedStyle(style.id)}><strong>{style.name}</strong><span>{style.description}</span></button>)}
        </div>
        <button className="artwork-studio__generate" type="button" onClick={generate} disabled={busy || !canGenerate}>
          {busy ? '正在生成…' : hasIncludedVersion ? entitlement.artworkCredits > 0 ? `使用 1 积分重新生成 · 剩余 ${entitlement.artworkCredits}` : '免费生成已使用 · 暂无追加积分' : '免费生成本命牌专属画境'}
        </button>
        {versions.length > 0 && <div className="artwork-studio__versions">
          <h3>生成版本</h3>
          <div>{versions.map((version) => <article key={version.id}><img src={version.url} alt={`${version.styleId || '专属'}画境`} /><p>{version.persistent ? '已持久保存' : '临时预览地址'}{version.selected ? ' · 当前使用' : ''}</p><button type="button" disabled={version.selected} onClick={() => chooseVersion(version)}>{version.selected ? '当前画境' : '设为当前'}</button></article>)}</div>
        </div>}
      </section>
    </div>
  );
}
