import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

test('restored inference renders Yan thinking steps without crashing', async () => {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: AgentDialogueOverlay } = await vite.ssrLoadModule(
      '/src/components/board/AgentDialogueOverlay.jsx',
    );
    const inference = {
      state: 'ORACLE',
      sessionId: 'restored-session',
      questionType: { label: '职业决策' },
      memory: [{ type: 'working', content: '已确认预算边界' }],
      perspectivePool: [{ id: 'risk', name: '风眼', perspective: 'risk' }],
      plan: {
        agents: [{ id: 'risk', name: '风眼' }],
        divergence: '成本与机会冲突',
      },
    };

    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AgentDialogueOverlay, {
          phase: 'reflecting',
          question: '恢复中的职业推演问题',
          inference,
          candidateAgents: [],
          activeAgents: [],
          agentDialogues: {},
        }),
      ),
    );

    assert.match(markup, /演 · 正在思索/);
    assert.match(markup, /职业决策/);
    assert.match(markup, /匹配智囊/);
    assert.match(markup, /预判分歧/);
  } finally {
    await vite.close();
  }
});
