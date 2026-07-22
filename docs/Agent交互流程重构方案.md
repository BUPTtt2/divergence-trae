# Agent 交互流程重构方案

## 1. 目标

实现一个完整的多 Agent 决策分析流程，核心特点：

1. **演（主控 Agent）**：分析问题，挑选/生成合适的 Agent 团队
2. **每个 Agent 独立视角**：从自己的专业角度反问用户
3. **递进式对话**：Agent 问 → 用户答 → Agent 判断是否继续追问 → 下一个 Agent
4. **全局总结**：演梳理所有 Agent 的对话，生成总结和选项
5. **周易卜卦推荐**：结合卦象为每个选项提供参考

## 2. 状态机设计

### 2.1 状态流转图

```
input → casting → summoning → agent_select → agent_ask → user_answer → agent_judge
                                                              ↓             ↓
                                                          continue_ask  next_agent
                                                              ↓             ↓
                                                          agent_ask  ─────────┐
                                                              ↓               │
                                                    所有 Agent 完成？          │
                                                       ↓           ↓         │
                                                   yes           no ─────────┘
                                                     ↓
                                            yan_global_ask → yan_summary → divination_recommend → user_select → final
```

### 2.2 状态定义

| 状态 | 说明 | UI 展示 |
|------|------|---------|
| `input` | 用户输入问题 | 输入框 + 提交按钮 |
| `casting` | 投币起卦 | 三枚铜钱动画 |
| `summoning` | 演分析问题，召唤 Agent | 罗盘指向动画 |
| `agent_select` | 用户确认/调整 Agent 团队 | Agent 选择面板 |
| `agent_ask` | 当前 Agent 反问用户 | Agent 头像 + 问题文字 |
| `user_answer` | 用户回答 | 输入框 |
| `agent_judge` | 判断是否继续追问 | 加载状态 |
| `yan_global_ask` | 演全局追问 | 演的头像 + 追问文字 |
| `yan_summary` | 演生成总结和选项 | 总结文本 + 选项卡片 |
| `divination_recommend` | 卜卦推荐 | 卦象展示 + 解读 |
| `user_select` | 用户选择最终方案 | 选项卡片 |
| `final` | 推演完成 | 命签展示 |

## 3. 核心数据流

### 3.1 Agent 对话历史结构

```javascript
interface DialogueHistory {
  agentId: string;
  agentName: string;
  stance: string;
  rounds: Array<{
    question: string;      // Agent 的问题
    answer: string;        // 用户的回答
  }>;
  finalAnalysis: string;   // Agent 最终分析（可选）
}
```

### 3.2 全局状态

```javascript
interface GameState {
  question: string;                    // 用户原始问题
  agents: Array<Agent>;                // 参与的 Agent 列表
  selectedAgents: Array<Agent>;        // 用户选择的 Agent
  currentAgentIndex: number;           // 当前正在对话的 Agent 索引
  agentDialogues: Array<DialogueHistory>; // 所有 Agent 的对话历史
  yanSummary: string;                  // 演的总结
  options: Array<{
    label: string;
    keyPoints: Array<string>;
    guaRecommendation: string;
    guaDetail: object;
  }>;
  selectedChoice: string;              // 用户最终选择
  inference: object;                   // 推演引擎返回的数据
  oracleResult: object;                // 卜卦结果
}
```

## 4. API 调用流程

### 4.1 演分析问题

```javascript
// POST /api/agents/analyze
const result = await apiClient.analyzeQuestion(question);
// 返回: { agents, reasoning, analysis, agentIds }
```

### 4.2 Agent 反问

```javascript
// POST /api/agents/ask
const result = await apiClient.askQuestion(agentId, question, dialogueHistory);
// 返回: { agentId, agentName, question, needMoreInfo }
```

### 4.3 判断是否继续追问

```javascript
// POST /api/agents/continue-ask
const result = await apiClient.continueAsking(
  agentId, 
  originalQuestion, 
  dialogueHistory, 
  lastUserAnswer
);
// 返回: { agentId, agentName, continueAsking, nextQuestion }
```

### 4.4 演的全局总结

```javascript
// POST /api/agents/summary
const result = await apiClient.generateSummary(
  originalQuestion, 
  agentIds, 
  dialogueHistory
);
// 返回: { summary, options: [{ label, keyPoints, guaRecommendation }] }
```

### 4.5 卜卦

```javascript
// POST /api/divination/cast
const hexagram = await apiClient.castHexagram(question);

// POST /api/divination/interpret
const interpretation = await apiClient.interpretHexagram(
  hexagram, 
  question, 
  agentDialogues
);
```

## 5. 前端实现要点

### 5.1 Agent 反问-回答-追问循环

```javascript
// 在 agent_ask 状态，调用 askQuestion
const handleAgentAsk = async () => {
  const agent = selectedAgents[currentAgentIndex];
  const result = await apiClient.askQuestion(
    agent.id, 
    question, 
    getCurrentDialogueHistory()
  );
  setCurrentAgentQuestion(result.question);
  setPhase('user_answer');
};

// 用户回答后，判断是否继续追问
const handleUserAnswer = async (answer) => {
  const agent = selectedAgents[currentAgentIndex];
  const result = await apiClient.continueAsking(
    agent.id, 
    question, 
    getCurrentDialogueHistory(), 
    answer
  );
  
  if (result.continueAsking && getCurrentRoundCount() < 2) {
    // 继续追问
    setCurrentAgentQuestion(result.nextQuestion);
    setPhase('user_answer');
  } else {
    // 进入下一个 Agent
    nextAgent();
  }
};
```

### 5.2 演的全局总结

```javascript
const handleYanSummary = async () => {
  const agentIds = selectedAgents.map(a => a.id);
  const dialogueHistory = formatDialogueHistoryForSummary();
  
  const result = await apiClient.generateSummary(
    question, 
    agentIds, 
    dialogueHistory
  );
  
  setYanSummary(result.summary);
  setOptions(result.options);
  setPhase('divination_recommend');
};
```

### 5.3 卜卦推荐

```javascript
const handleDivinationRecommend = async () => {
  // 为每个选项生成卦象推荐
  const recommendations = await Promise.all(
    options.map(async (option, index) => {
      const hexagram = await apiClient.castHexagram(
        `${question} - ${option.label}`
      );
      const interpretation = await apiClient.interpretHexagram(
        hexagram, 
        question, 
        { [option.label]: option.keyPoints }
      );
      return { ...option, guaDetail: interpretation };
    })
  );
  setOptions(recommendations);
  setPhase('user_select');
};
```

## 6. UI 设计要求

### 6.1 Agent 反问界面

- Agent 头像悬浮在上方
- 问题文字以打字机效果显示
- 回答输入框在底部，带字数限制（100字）
- "继续"按钮在输入框右侧

### 6.2 选项卡片

每个选项卡片包含：
- 选项名称（大号字体）
- 3个关键点摘要（列表形式）
- 卦象推荐标签（如「乾·天」）
- 卦象解读（简短文字）
- 卦象图标

### 6.3 演的总结界面

- 居中显示演的头像
- 总结文字以打字机效果显示
- 选项卡片在总结下方
- 卦象推荐在选项卡片内部

## 7. 状态控制机制

### 7.1 状态流转控制

状态流转由 `Game.jsx` 中的 `phase` 状态控制，通过以下函数触发：

| 函数 | 触发状态 | 下一状态 |
|------|---------|---------|
| `handleStart` | input | casting |
| `handleConfirmAgents` | agent_select | agent_ask |
| `handleAgentAsk` | agent_ask | user_answer |
| `handleUserAnswer` | user_answer | agent_judge |
| `handleContinueAsk` | agent_judge | agent_ask |
| `handleNextAgent` | agent_judge | agent_ask / yan_global_ask |
| `handleYanGlobalAsk` | yan_global_ask | yan_summary |
| `handleYanSummary` | yan_summary | divination_recommend |
| `handleDivinationRecommend` | divination_recommend | user_select |
| `handleChoiceClick` | user_select | final |

### 7.2 数据持久化

对话历史在每个 Agent 完成对话后保存到 `agentDialogues` 数组，最终保存到 localStorage 或云端。

## 8. 本地降级策略

当后端不可用时：

1. **Agent 反问**：使用本地预设问题库
2. **追问判断**：简单规则判断（回答长度 < 5 字则继续追问）
3. **总结生成**：使用本地模板生成总结
4. **卜卦推荐**：使用本地卦象随机选择

## 9. 关键代码位置

### 9.1 前端

| 文件 | 职责 |
|------|------|
| `src/pages/Game.jsx` | 主状态机，控制整个流程 |
| `src/services/inferenceEngine.js` | 本地降级逻辑 |
| `src/services/apiClient.js` | API 调用封装 |
| `src/components/board/AgentDialogueOverlay.jsx` | Agent 对话浮层 |
| `src/components/board/ChoiceHud.jsx` | 选项卡片 |

### 9.2 后端

| 文件 | 职责 |
|------|------|
| `server/src/services/agentEngine.js` | Agent 编排引擎 |
| `server/src/routes/agent.js` | Agent API 路由 |
| `server/src/services/yiJingEngine.js` | 易经运算 |

## 10. 注意事项

1. **追问次数限制**：每个 Agent 最多追问 2 次，避免无限循环
2. **超时处理**：每个 API 调用设置 8 秒超时，降级到本地预设
3. **用户控制**：所有状态流转需要用户点击确认，自动推进仅限于动画过渡
4. **历史记录**：所有对话历史需要保存，支持查看和回顾
5. **响应式设计**：移动端和桌面端都需要良好体验