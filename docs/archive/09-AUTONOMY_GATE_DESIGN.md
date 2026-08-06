# 演的自主性（AutonomyGate）· 详细推理设计文档

> **版本**: v1.0 (2026-07-30)
> **定位**: Step 4 自主性的详细推理文档。回答"基于现有改造还是整体重做"——**基于现有 ClarifyDialog 改造**。
> **关联**: [`REAL_AGENT_ARCHITECTURE.md`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/docs/REAL_AGENT_ARCHITECTURE.md) 4.1 节、[`../src/components/ClarifyDialog.jsx`](file:///Users/yegua/vibe/个人Trae赛/divergence-trae/src/components/ClarifyDialog.jsx)

---

## 0. 结论先行

**基于现有 ClarifyDialog.jsx 改造，不整体重做**。理由：
1. 现有组件已有完整赛博风样式（深紫底+金边+毛玻璃）、framer-motion 动画、多问题分步、进度指示、跳过/提交流程——地基可用
2. 动画调很久是现实约束，整体重做风险高；改造只需增量加5个点
3. 业界最佳实践（Salesforce/OpenAI）强调"一次问一个开放式问题"，现有分步交互已符合

**改造5个点**（增量，不破坏现有）：
1. 触发源从单一扩展为5种（后端 autonomyGate 决定）
2. 加"卦位缺角"视觉（八卦维度联动，CSS即可）
3. 加个性化开场吊言（基于记忆，演的开场白）
4. 支持递进式多轮（后端控制，前端只需多轮渲染）
5. textarea 卜筹化（样式增强，非重做）

---

## 1. 业界最佳实践参考

### 1.1 Salesforce "10 Ways to Make Your AI Agent a Better Communicator" (2026-05)
- **#4 Smart Disambiguation**：当用户问题可能有多种含义时，问**针对性澄清问题**，而非泛泛的"告诉我更多"。**一次只问一个问题**，开放式，结尾引导用户回答
- **#1 Structured Response**：3-5步+引导性问题
- **#5 Consistent Terminology**：用品牌语言，定义关键术语
- 启发：演的追问要"一次一个开放式问题"，用赛博算命术语（天机/卦位/命格）

### 1.2 OpenAI 社区 "Conversational Correction Strategy" (2026-07)
- **High-Ambiguity Strategy: Clarification Before Correction**：高歧义时先澄清再继续
- **Assume Good Faith**：不评判用户（不说"你错了"），直接引导
- **Probability ≠ truth**：最可能的意思不一定是用户的真实意图，高歧义才问
- 启发：演追问前先判断"是否真歧义"，不过度追问；不评判用户（"你这样想不对"），而是"天机不全，需再问"

### 1.3 火山引擎 DataAgent "意图澄清配置" (2025-10)
- 意图模糊时智能体**主动追问**
- 一次交互**不要包含多个意图**
- 启发：演一轮只问一个核心意图（前提/记忆/工具异常选一个），不混问

### 1.4 综合原则（本架构遵循）
1. **一次一个开放式问题**（Smart Disambiguation）
2. **高歧义才问**（Clarification Before Correction），不过度追问
3. **不评判用户**（Assume Good Faith）
4. **最多2轮**（避免疲劳，超限降级"天机虽不全，演且据现有推之"）
5. **个性化**（基于记忆，老用户引用历史）

---

## 2. 触发优先级设计（自主设计 + 业界依据）

### 2.1 5种触发源及优先级

| 优先级 | 触发源 | 触发条件 | 赛博语义 | 业界依据 |
|--------|--------|---------|---------|---------|
| **P0** | 抉择前提缺失 | 问题缺时间/预算/目的/同行人（影响所有维度） | "天机不全" | Smart Disambiguation：核心要素优先 |
| **P1** | 记忆冲突 | L3命格与问题相关但未提及（如哮喘史+去西藏） | "演记你命格，今可有所虑？" | 个性化+Assume Good Faith（不评判，只提醒） |
| **P2** | 工具结果异常 | ToolProbe 返回异常信号（大雪/政策收紧/股价暴跌） | "天机示警" | Clarification Before Correction：基于实时数据 |
| **P3** | 维度缺关键参数 | 某维度缺关键参数（如travel风险缺"时间"→天气不精确） | "卦位有缺" | Smart Disambiguation：针对性问题 |
| **P4** | 历史模式 | 连续3次同类选择（仅老用户） | "演观汝皆择稳守..." | 个性化（开场点缀，非阻塞） |

### 2.2 优先级决策逻辑

```
演在 Plan 阶段判定:
1. 扫描 P0-P4，收集所有触发的勘问源
2. 按 P0→P4 排序，取最高优先级的1个（一次一个意图）
3. 若 P0 触发 → 问前提（不问其他，避免混问）
4. 若 P0 未触发但 P1 触发 → 问记忆冲突
5. ...依此类推
6. 第1轮问完，用户回答后，进入第2轮判定：
   - 基于第1轮答案，重新扫描 P0-P4
   - 若有新触发（如用户透露哮喘→P1记忆冲突更新）→ 第2轮问
   - 否则 → 停止，进入 EXECUTE
7. 超过2轮 → 降级"天机虽不全，演且据现有推之"
```

### 2.3 为什么 P0 前提缺失优先级最高

- 业界：Smart Disambiguation 强调核心要素优先
- 业务：缺前提（如"去西藏"没说时间）→ 所有维度（风险/健康/体验）都无法精确评估，工具探测也无效（weather_query 不知道查哪天）
- 体验：用户最关心的是"我的具体情况"，先问前提让用户感到被理解

### 2.4 为什么 P1 记忆冲突次之

- 业界：个性化 + Assume Good Faith（不评判，只提醒）
- 业务：记忆冲突是演"记住用户"的核心体现，是留存关键
- 体验：老用户看到"演记你曾虑高反"会产生信任感

---

## 3. 现有 ClarifyDialog 分析（改造基础）

### 3.1 现有能力（可复用）

| 能力 | 现状 | 评价 |
|------|------|------|
| 赛博风样式 | 深紫底 `#1a1520`+金边 `#C8A850`+毛玻璃 backdrop-filter | ✅ 优秀，保留 |
| framer-motion 动画 | 淡入+缩放+位移+进度指示 | ✅ 优秀，保留 |
| 多问题分步 | idx 推进，isLast 判定 | ✅ 符合"一次一个"，保留 |
| 跳过/提交 | handleSkip/handleNext | ✅ 保留 |
| LLM文本清洗 | sanitizeLLMText | ✅ 保留 |
| 标题 | "演·澄清"+"推演前需先补全信息" | ⚠️ 改为"天机不全·演问" |

### 3.2 现有不足（改造点）

| 不足 | 改造方案 | 工作量 |
|------|---------|--------|
| 触发源单一 | 后端 autonomyGate 决定5种触发，前端只渲染 | 后端为主 |
| 无卦位缺角视觉 | 加八卦位指示器（CSS，基于 plan.dimensions） | 小（CSS+数据） |
| 无个性化开场吊言 | 加开场白区（基于记忆，演的吊言） | 小（加一段） |
| 无递进式多轮 | 后端控制多轮，前端支持 round 指示 | 小（加round标识） |
| textarea 普通样式 | 卜筹化（边框/背景微调，非重做） | 小（样式） |
| 无"天机不全"入场 | 加红字"天机不全"标题（不做太极裂变，留Step7） | 小 |

### 3.3 关键决策：不动现有动画，只增量加

- 现有 framer-motion 动画保留不动（避免调动画耗时）
- 只新增：卦位指示器（纯CSS）、开场吊言（文本块）、round指示（小元素）
- 太极裂变/卜筹碎裂等复杂动效**留到 Step 7 统一打磨**（用户认可）

---

## 4. 视觉增强设计（基于现有样式）

### 4.1 改造后结构（增量）

```
┌─────────────────────────────────┐
│  天机不全 · 演问  (P0红字标题)    │  ← 改标题
│  ─────────────────              │
│  [开场吊言]                      │  ← 新增：基于记忆
│  "演记汝曾虑高反，今去西藏..."    │
│                                 │
│  [卦位缺角指示器]                │  ← 新增：八卦位
│  ☰乾 ☱兑 ☲离 ☳震 ☴巽 ☵坎 ☶艮 ☷坤 │     暗的=缺角
│                                 │
│  第 1/2 轮 · 演问：              │  ← 新增：round指示
│  何日启程？盘缠几何？            │
│                                 │
│  [卜筹textarea]                  │  ← 样式增强
│                                 │
│  [跳过]      [下一个 →]          │  ← 保留
└─────────────────────────────────┘
```

### 4.2 卦位缺角指示器（纯CSS）

基于 plan.dimensions 的 perspective 映射八卦（见 REAL_AGENT_ARCHITECTURE.md 5.2节）：
- 已覆盖的维度 → 卦位亮（金色）
- 未覆盖的维度 → 卦位暗（灰）+ 微抖动

```jsx
// 伪代码
const HEXAGRAM_MAP = { strategic:'乾', communication:'兑', emotional:'离', action:'震',
  experience:'巽', risk:'坎', practical:'艮', health:'坤' };
const covered = new Set(plan.dimensions.map(d => d.perspective));
// 渲染8个卦位，covered的亮，未covered的暗
```

### 4.3 个性化开场吊言（基于记忆）

```jsx
// 伪代码
const openingLine = memory.length > 0
  ? `演记汝：${memory[0].content}。今问此事，可有所虑？`
  : '演初识汝，可愿告知所图？';
```

### 4.4 round 指示

```jsx
<div>第 {round}/2 轮 · 演问</div>
{round === 2 && <div style={{color:'#888',fontSize:'11px'}}>天机将明，再问此轮</div>}
```

---

## 5. 后端 autonomyGate.js 设计

### 5.1 导出接口

```javascript
// server/src/services/autonomyGate.js
export async function evaluate(session, memory, toolResults) {
  // 返回 { action: 'ASK'|'STOP'|'CONTINUE', questions:[{question, reason, source}], round }
  const triggers = scanTriggers(session, memory, toolResults);
  if (triggers.length === 0) return { action: 'CONTINUE' };
  if (session.round >= 2) return { action: 'STOP', reason: '天机虽不全，演且据现有推之' };
  const top = triggers[0]; // 最高优先级
  return { action: 'ASK', questions: [buildQuestion(top, session, memory)], round: session.round + 1, source: top.source };
}
```

### 5.2 触发源扫描

```javascript
function scanTriggers(session, memory, toolResults) {
  const triggers = [];
  // P0 前提缺失
  const missingPrereqs = detectMissingPrereqs(session.question, session.questionType);
  if (missingPrereqs.length > 0) triggers.push({ source:'P0', ...missingPrereqs });
  // P1 记忆冲突
  const memoryConflicts = detectMemoryConflicts(session.question, memory);
  if (memoryConflicts.length > 0) triggers.push({ source:'P1', ...memoryConflicts });
  // P2 工具异常
  const toolAnomalies = detectToolAnomalies(toolResults);
  if (toolAnomalies.length > 0) triggers.push({ source:'P2', ...toolAnomalies });
  // P3 维度缺参数
  const dimGaps = detectDimensionGaps(session.plan.dimensions, session.question);
  if (dimGaps.length > 0) triggers.push({ source:'P3', ...dimGaps });
  // P4 历史模式（仅老用户）
  if (memory.length >= 3) {
    const pattern = detectChoicePattern(memory);
    if (pattern) triggers.push({ source:'P4', ...pattern });
  }
  return triggers.sort((a,b) => PRIORITY[a.source] - PRIORITY[b.source]);
}
```

### 5.3 接入 planner.js

planner.plan() 在工具探测后、生成 DeliberationPlan 后，调 autonomyGate.evaluate()：
- action=ASK → session.state='WAIT', session.askUser=questions
- action=CONTINUE/STOP → session.state='EXECUTE'

### 5.4 接入 deliberationEngine.answer()

用户回答追问后，answer() 重新调 planner.plan()（带答案上下文），planner 再调 autonomyGate（round+1），决定是否第2轮追问或进入EXECUTE。

---

## 6. 实现路径（Step 4 拆分）

### 6.1 后端（autonomyGate + planner接入）
1. 创建 autonomyGate.js（evaluate + scanTriggers + 5个detect函数 + buildQuestion）
2. 修改 planner.js：Plan末尾调 autonomyGate.evaluate()，ASK则state=WAIT
3. 修改 deliberationEngine.js：answer() 重新plan，支持round递增
4. 5个detect函数用规则（关键词/记忆比对/工具结果解析），LLM增强可选

### 6.2 前端（ClarifyDialog 改造）
1. 标题改"天机不全·演问"
2. 加开场吊言区（props传入 memory）
3. 加卦位缺角指示器（props传入 plan.dimensions）
4. 加round指示（props传入 round/maxRound）
5. textarea 卜筹化（边框/背景微调）
6. 现有动画/流程不动

### 6.3 验证
- 后端 selfTest：start('去西藏') → 若无记忆则P0触发→askUser非空→state=WAIT
- 前端：ClarifyDialog 渲染卦位缺角+吊言+round

---

## 7. 与 REAL_AGENT_ARCHITECTURE.md 的关系

本文档细化 4.1 节自主性设计，补充：
- 业界最佳实践依据
- 基于现有组件的改造决策（不整体重做）
- 触发优先级排序（P0-P4）
- 前端改造方案（增量5点）

实现后回填 REAL_AGENT_ARCHITECTURE.md 4.1 节的引用。

---

> **下一步**: 按第6节实现路径执行。后端用 subAgent，前端 ClarifyDialog 改造用 subAgent。
