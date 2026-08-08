import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const component = fs.readFileSync(new URL('./LiveArenaOverlay.jsx', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('./liveArenaOverlay.css', import.meta.url), 'utf8');

test('crystallize and Lens review glow follows standard, reduced and off motion modes', () => {
  assert.match(component, /live-arena__cue--motion-\$\{mode\}/);
  assert.match(styles, /live-arena__cue--motion-reduced[\s\S]*box-shadow:/);
  assert.match(styles, /live-arena__cue--motion-off[\s\S]*box-shadow:\s*none/);
});

test('component applies system reduced motion to saved standard and renders off cues without motion styles', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  const projection = {
    lastSequence: 1,
    transport: { connected: true, replaying: false },
    tasks: {},
    agents: {},
    evidence: {},
    conflicts: [],
    motionCue: { id: 'cue-1', kind: 'lens-review' },
  };
  let LiveArenaOverlay;

  function render(savedMode, prefersReduced) {
    globalThis.window = {
      localStorage: { getItem: () => savedMode, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => ({
        matches: prefersReduced,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    };
    return renderToStaticMarkup(createElement(LiveArenaOverlay, { projection }));
  }

  try {
    ({ default: LiveArenaOverlay } = await vite.ssrLoadModule('/src/components/board/LiveArenaOverlay.jsx'));
    const reducedMarkup = render('standard', true);
    const offMarkup = render('off', true);

    assert.match(reducedMarkup, /live-arena__cue--motion-reduced/);
    assert.match(offMarkup, /live-arena__cue--motion-off/);
    assert.doesNotMatch(offMarkup, /style=/);
  } finally {
    delete globalThis.window;
    await vite.close();
  }
});

test('expanded Lens card keeps formation, causal references and finding links in DOM text', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  globalThis.window = {
    localStorage: { getItem: () => 'off', setItem: () => {} },
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  };
  const projection = {
    lastSequence: 4,
    transport: { connected: true, replaying: false },
    tasks: {},
    agents: {},
    evidence: {},
    conflicts: [],
    lens: {
      selected: {
        lensId: 29,
        lensName: '坎',
        source: 'session-derived',
        formation: {
          primary: { lowerTrigram: '离', upperTrigram: '坎' },
          changed: { lowerTrigram: '乾', upperTrigram: '坤' },
          lines: [
            { position: 1, yinYang: 'yang', knowledgeState: 'verified', perspective: 'strategic', dynamic: false },
            { position: 2, yinYang: 'yin', knowledgeState: 'contested', perspective: 'risk', dynamic: true },
            { position: 3, yinYang: 'yang', knowledgeState: 'unknown', perspective: 'financial', dynamic: false },
            { position: 4, yinYang: 'yin', knowledgeState: 'verified', perspective: 'action', dynamic: false },
            { position: 5, yinYang: 'yang', knowledgeState: 'unknown', perspective: 'communication', dynamic: false },
            { position: 6, yinYang: 'yin', knowledgeState: 'verified', perspective: 'practical', dynamic: false },
          ],
        },
        invariants: { evidenceLocked: true, riskLocked: true, approvalLocked: true, userDecisionLocked: true },
      },
      tasks: {
        'lens-task-risk': {
          taskId: 'lens-task-risk',
          question: '最坏情况是什么？',
          status: 'completed',
          causedBy: ['ref_lens_29', 'ref_conflict_cashflow'],
        },
      },
      impacts: {
        'lens-task-risk': {
          taskId: 'lens-task-risk',
          outcome: 'claim-challenged',
          summary: '主张仍需核验。',
          findingIds: ['finding-risk-1'],
        },
      },
      review: { summary: '审查完成。' },
    },
    motionCue: null,
  };

  try {
    const { default: LiveArenaOverlay } = await vite.ssrLoadModule('/src/components/board/LiveArenaOverlay.jsx');
    const markup = renderToStaticMarkup(createElement(LiveArenaOverlay, { projection }));

    assert.match(markup, /六爻如何形成/);
    assert.match(markup, /主卦：离下 · 坎上/);
    assert.match(markup, /变卦：乾下 · 坤上/);
    assert.match(markup, /第1爻 · 阳爻 · 已验证 · strategic · 静爻/);
    assert.match(markup, /第2爻 · 阴爻 · 有冲突 · risk · 动爻/);
    assert.match(markup, /来源引用：ref_lens_29、ref_conflict_cashflow/);
    assert.match(markup, /关联 finding：finding-risk-1/);
  } finally {
    delete globalThis.window;
    await vite.close();
  }
});

test('arena renders task, advisor and event details instead of counters alone', async () => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  globalThis.window = {
    localStorage: { getItem: () => 'off', setItem: () => {} },
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  };
  const projection = {
    lastSequence: 4,
    status: 'planning',
    transport: { connected: true, replaying: false },
    tasks: { body: { id: 'body', label: '身体信号', status: 'planned' } },
    agents: { health: { id: 'health', agentName: '衡生', taskId: 'body', status: 'running', reason: '负责身体状态判断' } },
    evidence: {},
    conflicts: [],
    activity: [
      { id: 'evt-1', title: '会话已建立', detail: '要不要吃饭', createdAt: '2026-08-08T05:00:00.000Z' },
      { id: 'evt-2', title: '开始规划', detail: '辨认问题与推演深度', createdAt: '2026-08-08T05:00:01.000Z' },
    ],
    lens: { selected: null, tasks: {}, impacts: {}, review: null },
    motionCue: null,
  };

  try {
    const { default: LiveArenaOverlay } = await vite.ssrLoadModule('/src/components/board/LiveArenaOverlay.jsx');
    const markup = renderToStaticMarkup(createElement(LiveArenaOverlay, { projection }));
    assert.match(markup, /推演实况/);
    assert.match(markup, /身体信号/);
    assert.match(markup, /衡生/);
    assert.match(markup, /负责身体状态判断/);
    assert.match(markup, /会话已建立/);
    assert.match(markup, /辨认问题与推演深度/);
  } finally {
    delete globalThis.window;
    await vite.close();
  }
});
