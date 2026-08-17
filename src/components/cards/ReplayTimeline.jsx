import { useMemo, useState } from 'react';
import { buildReplaySections } from '../../pages/collectionReplayModel.js';
import './replayTimeline.css';

const FILTERS = [
  ['all', '全部'],
  ['user', '我的原话'],
  ['system', '系统问答'],
  ['advisor', '智囊发言'],
];

function exportReplay(card, events) {
  const lines = events.map((event) => {
    const time = event.occurredAt ? ` ${event.occurredAt}` : '';
    return `${String(event.seq).padStart(3, '0')} · ${event.speakerName || '过程'}${time}\n${event.text}`;
  });
  const content = [`演策完整推演 · ${card.title || card.gua || '命牌'}`, '', ...lines].join('\n\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `演策完整推演-${card.date || '记录'}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ReplayTimeline({ card }) {
  const [filter, setFilter] = useState('all');
  const replay = card?.replay || { schemaVersion: 1, completeness: 'partial', events: [] };
  const view = useMemo(() => buildReplaySections(replay.events, filter), [filter, replay.events]);

  if (replay.events.length === 0) {
    return (
      <section className="replay-timeline replay-timeline--legacy" aria-label="历史推演记录">
        <strong>这张历史命牌没有保存完整过程</strong>
        <p>仍可查看当时保留的命牌摘要，但系统不会补写或猜测缺失的原始问答。</p>
      </section>
    );
  }

  return (
    <section className="replay-timeline" aria-label="完整推演过程">
      <header className="replay-timeline__header">
        <div>
          <small>REPLAY V2 · 原始记录</small>
          <h3>完整推演过程</h3>
          <p>{view.counts.all} 条事件 · 我的原话 {view.counts.user} · 智囊 {view.counts.advisor}{view.counts.failures ? ` · 失败 ${view.counts.failures}` : ''}</p>
        </div>
        <button type="button" onClick={() => exportReplay(card, replay.events)}>导出完整过程</button>
      </header>

      <nav className="replay-timeline__filters" aria-label="过程筛选">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}<span>{view.counts[id]}</span>
          </button>
        ))}
      </nav>

      <div className="replay-timeline__sections">
        {view.sections.map((section) => (
          <section key={`${section.phase}:${section.events[0]?.id}`}>
            <header><span>{section.label}</span><small>{section.events.length} 条</small></header>
            <ol>
              {section.events.map((event) => (
                <li key={event.id} data-speaker={event.speakerType} data-failed={event.kind === 'advisor_failed'}>
                  <div>
                    <strong>{event.speakerName || '过程'}</strong>
                    <span>{event.kind === 'advisor_failed' ? '未完成' : `#${event.seq}`}</span>
                  </div>
                  <p>{event.text}</p>
                  {event.occurredAt && <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString('zh-CN')}</time>}
                </li>
              ))}
            </ol>
          </section>
        ))}
        {view.sections.length === 0 && <p className="replay-timeline__empty">这个筛选下没有记录。</p>}
      </div>
    </section>
  );
}
