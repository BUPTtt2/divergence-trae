# Agent 技术栈深度分析 (真实实现 vs Mock)

> **生成日期**: 2026-07-30
> **目的**: 真实梳理当前 Agent 系统每一层的实现状态，标注哪些是生产级实现、哪些是 mock/placeholder
> **核心结论**: Agent 系统经过多轮迭代，已具备可运行的完整链路，但存在前后端定义不一致、部分环节降级依赖过重等问题

---

## 一、Agent 系统全链路分析

### 1.1 链路总览

```
用户输入 → 问题检测 → Agent匹配 → Agent选择 → Agent辩论 → 总结 → 占卜 → 命签
```

### 1.2 每环节详细分析

| 环节 | 文件 | 实现类型 | 状态 | 说明 |
|------|------|----------|------|------|
| **问题检测** | `agents.js:detectQuestionType()` | 真实实现 (关键词匹配) | ✅ 可用 | 基于关键词+类型优先级检测 |
| | `agentEngine.js:detectQuestionType()` | 真实实现 (关键词匹配) | ⚠️ 不完整 | 后端缺少travel/education等类型 |
| **Agent匹配** | `agents.js:getAgentsForQuestion()` | 真实实现 (ID映射) | ✅ 可用 | 前端本地匹配 |
| | `agentEngine.js:analyzeQuestion()` | LLM+降级 | ✅ 可用 | 优先LLM分析，失败降级关键词 |
| **Agent池** | `agentPool.js` | 真实实现 (三层提示词) | ✅ 生产级 | 8个Agent，每层3段提示词 |
| | `agents.js` | 真实实现 (persona单段) | ⚠️ 降级用 | 12个Agent，仅后端不可达时用 |
| **Agent选择** | `AgentDialogueOverlay.jsx` | 真实实现 | ✅ 可用 | 动态覆盖、去重、选择 |
| **Agent辩论** | `agentEngine.js:generateAgentDialogue()` | LLM调用 | ✅ 生产级 | 三层提示词+Blackboard上下文 |
| | `multiAgentFramework.js:Blackboard` | 真实实现 | ✅ 可用 | 黑板共识、@提及协议 |
| **演总结** | `yanChatService.js` | LLM调用 | ✅ 可用 | 演的分析/总结/反思 |
| **占卜** | `yiJingEngine.js` | 真实实现 | ✅ 可用 | 铜钱算法+卦象解析 |
| **命签** | `cards.js` 路由 | 真实实现 | ✅ 可用 | 持久化+分享 |

---

## 二、关键数据结构

### 2.1 Agent 定义 (后端权威源)

```javascript
// server/src/data/agentPool.js
{
  id: 'qiangu',
  name: '钱谷',
  stance: '财务视角',
  color: '#C88848',
  questionTypes: ['career', 'finance', 'offer', 'startup'],
  identity: '你是钱谷...',        // 身份锚定
  methodology: '工作方法...',       // 执行步骤
  deliverable: '交付标准...',       // 硬约束
  persona: '你是钱谷...'           // 向后兼容
}
```

### 2.2 问题类型枚举 (双端不一致)

**后端** (14种):
```
career, finance, relationship, life, action, communication,
offer, startup, invest, city, legal, health, education, technical, product
```

**前端** (16种，多了):
```
+ travel, daily (前端独有)
```

**问题**: 当用户输入"我要不要去西藏"，前端检测为 `travel` 类型，匹配远足Agent。但后端 `analyzeQuestion` 不认识 `travel`，可能返回空或错误。

### 2.3 Agent-问题类型映射

**后端映射**:
```
career    → qiangu, luxiang, yuntu, zhenxing
finance   → qiangu, yuntu
offer     → qiangu, luxiang, fengyan, duiyan
startup   → qiangu, luxiang, fengyan, zhenxing
... (14种类型)
```

**前端映射** (扩展了4个Agent):
```
career    → qiangu, luxiang, yuntu, zhenxing, xuezhe
travel    → luyou, yangsheng, fengyan, xinhe
health    → yangsheng, fengyan, xinhe
education → xuezhe, luxiang, xinhe
... (16种类型)
```

---

## 三、真实实现 vs Mock 判定

### 3.1 生产级实现 (可直接使用)

| 模块 | 证明 |
|------|------|
| **Agent三层提示词** | 后端 `buildAgentSystemPrompt()` 拼接 identity+methodology+deliverable 传给LLM |
| **LLM调用链** | `llmRouter.js` → 智谱AI API，streaming响应 |
| **Blackboard共识** | `multiAgentFramework.js` 完整实现黑板、@提及、收敛检测 |
| **八卦占卜** | `yiJingEngine.js` 铜钱算法+64卦解析 |
| **命签持久化** | SQLite + Railway部署 |

### 3.2 降级实现 (可用但非最优)

| 模块 | 降级逻辑 |
|------|----------|
| **问题检测** | LLM失败 → 关键词匹配 (`detectQuestionType`) |
| **Agent匹配** | LLM失败 → `getAgentsForQuestion()` ID映射 |
| **Agent发言** | LLM失败 → `AGENT_PERSONAS` persona模板 |
| **决策树** | LLM失败 → `nodes.js` 硬编码树 |

### 3.3 Mock/占位 (需替换)

| 模块 | 问题 | 处置 |
|------|------|------|
| **前端4个扩展Agent** (远足/养生/法度/学者) | 后端不存在，LLM无法生成真实发言 | 👉 需同步到后端 |
| **自定义Agent** | 仅存localStorage，后端不认识custom_开头的ID | 👉 需后端支持 |
| **部分决策树节点** | `nodes.js` 中硬编码的 Offer 分支 | 👉 需动态生成 |

---

## 四、核心问题诊断

### 问题1: 前后端Agent定义分裂

```
前端:  "我要不要去西藏" → detectQuestionType → travel → getAgentsForQuestion → [远足, 养生, ...]
后端:  "我要不要去西藏" → classifyIntent → ??? (无travel类型) → analyzeQuestion → 可能返回空
合并:  后端返回的Agent(8个) + 前端补充的(4个) → 但后端Agent可能对"西藏"问题答非所问
```

**根因**: 后端 `detectQuestionType` 和 `agentPool.js` 的 `questionTypes` 没有 `travel`。当后端LLM分析时，它可能将"去西藏"归类为 `action` 或 `life`，返回钱谷/路向等不相关的Agent。

**影响**: 用户问旅行问题，被推荐财务/职业Agent，答非所问。

### 问题2: Agent去重逻辑过度工程化

当前有 **三层去重**:
1. `agents.js:getAgentsForQuestion()` — `seenIds` Set
2. `inferenceEngine.js:generateInferenceContent()` — `seenIds` + `seenNames` 双重Set
3. `AgentDialogueOverlay.jsx` — 过滤 `customIds`

**问题**: 每层都在做同样的事，增加维护成本，且容易出bug。

**建议**: 统一为一层去重，在数据进入UI之前完成。

### 问题3: Mock数据残留

已清除:
- ✅ `Game.jsx` line 34: `useState('要不要接那个新 Offer?')` → `useState('')`
- ✅ `Game.jsx` line 1718: placeholder → `'例如：要不要换城市？'`
- ✅ `nodes.js` line 16: placeholder → `'例如：要不要换城市？'`
- ✅ `Landing.jsx` line 672: 示例问题 → 多样化
- ✅ `MemoryPanel.jsx` line 45: 示例数据 → 通用化

---

## 五、迭代方案建议

### 方案A: 后端对齐方案 (推荐)

**思路**: 以后端为权威源，前端只做展示

1. **后端 agentPool.js 增加4个Agent**: 远足、养生、法度、学者（三层提示词）
2. **后端 detectQuestionType 增加 travel 类型**: 添加 `travel` 关键词列表，增加类型优先级
3. **后端 questionTypes 映射更新**: 每个Agent的 `questionTypes` 增加 `travel`
4. **前端 agents.js 改为 fetched**: 启动时从 `GET /api/agent/personas` 拉取，不再硬编码
5. **统一去重**: 只在 `inferenceEngine.js` 做一次去重

**工作量**: 3-5天

### 方案B: 前端增强方案 (快速)

**思路**: 后端不动，前端增加LLM调用补全扩展Agent

1. 后端增加 `/api/agent/dialogue` 接口支持扩展Agent的persona
2. 前端为4个扩展Agent生成临时persona，通过LLM调用生成真实发言
3. 自定义Agent同理，把persona传给后端

**优点**: 快速上线
**缺点**: 仍不是最优架构

### 方案C: 统一重构方案 (彻底)

**思路**: 重新设计Agent系统，引入Agent Registry

1. 建立Agent Registry (JSON Schema)，前后端共用
2. 后端实现Agent CRUD API
3. 前端通过API拉取Agent定义
4. 自定义Agent通过API保存，后端分配唯一ID
5. 问题类型也通过API获取，不再硬编码

**优点**: 彻底解决所有不一致问题
**缺点**: 工作量大，需要完整规划

---

## 六、决策建议

| 维度 | 方案A (后端对齐) | 方案B (前端增强) | 方案C (统一重构) |
|------|-----------------|-----------------|-----------------|
| 工作量 | 3-5天 | 1-2天 | 7-14天 |
| 解决问题 | 大部分 | 部分 | 全部 |
| 风险 | 低 | 中 | 高 |
| 可扩展性 | 高 | 低 | 最高 |
| 推荐度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

**建议**: 先执行方案A，快速解决核心体验问题。同时可以开始方案C的设计，分阶段实施。

---

## 附录: 关键文件索引

| 文件 | 作用 | 修改频率 | 权限等级 |
|------|------|----------|----------|
| `server/src/data/agentPool.js` | 权威Agent池 | 低 | 🔒 稳定，修改需review |
| `server/src/services/agentEngine.js` | Agent编排引擎 | 中 | ⚠️ 可迭代 |
| `server/src/services/llmRouter.js` | LLM路由 | 低 | 🔒 稳定 |
| `src/data/agents.js` | 前端Agent定义 | 中 | ⚠️ 跟随后端更新 |
| `src/services/inferenceEngine.js` | 推演引擎 | 高 | ✅ 可修改 |
| `src/pages/Game.jsx` | 推演页 | 高 | ✅ 可修改 |
| `src/components/board/AgentDialogueOverlay.jsx` | Agent对话UI | 高 | ✅ 可修改 |
