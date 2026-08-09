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

test('planned council candidates are presented as manager recommendations', async () => {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { default: AgentDialogueOverlay } = await vite.ssrLoadModule(
      '/src/components/board/AgentDialogueOverlay.jsx',
    );
    const candidates = [
      { id: 'health', name: '养生', stance: '健康视角', reason: '核对睡眠债与身体恢复边界' },
      { id: 'risk', name: '风眼', stance: '风险视角' },
    ];
    const markup = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(AgentDialogueOverlay, {
          phase: 'agent_select',
          question: '今晚要不要继续熬夜？',
          inference: { plan: { agents: candidates } },
          candidateAgents: candidates,
          activeAgents: candidates,
          selectedAgentIds: new Set(candidates.map((agent) => agent.id)),
          agentDialogues: {},
        }),
      ),
    );

    assert.match(markup, /推荐 2 · 共 2/);
    assert.match(markup, /核对睡眠债与身体恢复边界/);
  } finally {
    await vite.close();
  }
});
