# 演 · 动态Agent生成架构 (v2)

> **版本**: v2.0 (2026-07-30)
> **目标**: 演 = 通用Agent生成引擎，能为任何领域的任何问题创造专属智囊
> **设计哲学**: 演不是从固定池挑Agent，演本身就是Agent的创造者。种子是初始思维框架，共享池是演与所有用户共同生长的思维遗产。

---

## 一、核心理念 (v2)

### 1.1 一句话定义

**演是一个Agent生成器，而非Agent选择器。**

### 1.2 三个层次的转变

| 维度 | v1 (旧) | v2 (新) |
|------|---------|---------|
| Agent来源 | 固定池匹配 | 演即时生成 + 共享池复用 |
| 覆盖能力 | 只能处理预设问题类型 | 任何领域、任何问题 |
| Agent归属 | 系统预设 | 演+用户共同创造，**共享** |
| 生长模式 | 静态 | 每次使用都可能扩展Agent池 |

### 1.3 演的三重角色

```
演 = 分析者 + 创造者 + 策展人

1. 分析者: 深度理解问题 → 拆解决策维度
2. 创造者: 为每个维度生成专属Agent (三层提示词)
3. 策展人: 从共享池中挑选最适合的Agent，不足则创造
```

---

## 二、架构全景

### 2.1 数据流

```
用户A: "我要不要去西藏"
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  演 (YAN) 通用Agent生成引擎                           │
│                                                     │
│  Step 1: 深度分析                                    │
│  ├─ 问题: "我要不要去西藏"                            │
│  ├─ 核心矛盾: 安全vs体验 / 时间vs意义 / 身体vs心理      │
│  ├─ 决策维度:                                        │
│  │   ├─ 风险评估 (已有: 风眼)                        │
│  │   ├─ 身体适应 (已有: 养生)                        │
│  │   ├─ 财务成本 (已有: 钱谷)                        │
│  │   ├─ 体验价值 (缺失!)                            │
│  │   ├─ 目的地信息 (缺失!)                           │
│  │   └─ 人生意义 (已有: 镜渊)                        │
│  │                                                   │
│  Step 2: 匹配共享池                                  │
│  ├─ 查种子Agent: 风眼✓ 养生✓ 钱谷✓ 镜渊✓              │
│  ├─ 查共享池: 有无"体验价值""目的地信息"的Agent?       │
│  │   └─ 没有 → 触发生成                              │
│  │                                                   │
│  Step 3: 动态生成                                    │
│  ├─ 生成: 旅悟 (体验价值视角)                         │
│  ├─ 生成: 观途 (目的地信息视角)                       │
│  ├─ 质量校验: 通过 ✓                                │
│  ├─ 写入共享池: fingerprint="travel_experience_xxx"    │
│  └─ 返回本次使用                                    │
│  │                                                   │
│  Step 4: 合成交付                                    │
│  └─ 最终Agent团队: [风眼, 养生, 钱谷, 镜渊, 旅悟, 观途] │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  Agent 辩论 (Blackboard)                             │
│  6个Agent平等发言 → 黑板共识 → 演总结                  │
└─────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────┐
│  后续用户B: "我要不要去云南"                           │
│  → 演分析 → 匹配共享池 → 发现"旅悟"和"观途"已存在       │
│  → 直接复用 (不再生成) → 节省token                     │
│  → 旅悟和观途的使用次数+1                              │
└─────────────────────────────────────────────────────┘
```

### 2.2 Agent池架构 (共享生态)

```
┌─────────────────────────────────────────────────────┐
│                演的共享Agent池                         │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │  Tier 1: 种子Agent (12个)                     │    │
│  │  演的初始思维框架，覆盖最常见的决策维度         │    │
│  │  钱谷/路向/风眼/心禾/镜渊/云图/震行/兑言/法度/  │    │
│  │  养生/师道/远足                               │    │
│  └─────────────────────────────────────────────┘    │
│         │                                           │
│         │ 演基于种子思维 + 用户问题 → 变异生成        │
│         ▼                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │  Tier 2: 演生Agent (动态生成)                 │    │
│  │  由演在分析问题时即时创造                      │    │
│  │  三层提示词自动构建                            │    │
│  │  存入共享池，所有人可复用                       │    │
│  │  热度排序 + 质量评分                           │    │
│  │  例: 旅悟(体验)、观途(目的地)、身度(身体适应)   │    │
│  └─────────────────────────────────────────────┘    │
│         │                                           │
│         │ 用户手动创建                              │
│         ▼                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │  Tier 3: 用户共创Agent                        │    │
│  │  用户在铸造台手动创建                           │    │
│  │  可设为"仅自己用" 或 "贡献到共享池"             │    │
│  │  贡献到共享池的Agent需经社区审核                │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  淘汰机制:                                          │
│  - 连续30天未使用 + 评分<0.6 → 归档                 │
│  - 归档Agent不参与匹配，但不删除                    │
│  - 热门Agent(使用≥50次)永久保护                    │
└─────────────────────────────────────────────────────┘
```

---

## 三、核心流程详解

### 3.1 演的分析→创造→策展 循环

```
                    ┌──────────────┐
                    │   用户问题    │
                    └──────┬───────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │  演·Phase 1: 深度分析      │
              │                          │
              │  输入: 用户问题           │
              │  处理: LLM拆解决策维度     │
              │  输出:                    │
              │  {                        │
              │    dimensions: [          │
              │      { name: "风险",     │
              │        perspective: "risk",│
              │        importance: 5,    │
              │        existingAgents:   │
              │        ["fengyan"] },    │
              │      { name: "体验",     │
              │        perspective:      │
              │        "experience",     │
              │        existingAgents:   │
              │        []  ← 缺失! },    │
              │      ...                  │
              │    ],                     │
              │    coverage: 0.6,  ← 60%  │
              │    missing: [             │
              │      "experience",       │
              │      "destination_info"   │
              │    ]                      │
              │  }                        │
              └──────────────┬───────────┘
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
          coverage ≥ 80%       coverage < 80%
                    │                 │
                    ▼                 ▼
        ┌────────────────┐   ┌─────────────────────┐
        │  Phase 2a:     │   │  Phase 2b:          │
        │  直接策展       │   │  动态创造            │
        │                │   │                     │
        │  从共享池中挑选 │   │  为缺失维度生成Agent │
        │  最适合的Agent  │   │  三层提示词自动构建  │
        │                │   │  质量校验            │
        └────────┬───────┘   │  写入共享池          │
                 │           └──────────┬──────────┘
                 │                        │
                 └────────┬───────────────┘
                          │
                          ▼
              ┌──────────────────────────┐
              │  Phase 3: 合成与交付      │
              │                          │
              │  1. 合并所有Agent         │
              │  2. 去重 (id+name)       │
              │  3. 排序 (相关性优先)    │
              │  4. 计算覆盖率           │
              │  5. 更新Agent使用计数    │
              │  6. 返回完整Agent列表    │
              └──────────────┬───────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │  Phase 4: 辩论与总结      │
              │                          │
              │  Blackboard辩论           │
              │  → 演总结                 │
              │  → 占卜立卦               │
              │  → 生成命签               │
              └──────────────────────────┘
```

### 3.2 覆盖率计算方式

```javascript
function calculateCoverage(dimensions, matchedAgents) {
  const totalDimensions = dimensions.length;
  const coveredDimensions = dimensions.filter(d => {
    // 检查此维度是否有Agent覆盖
    return matchedAgents.some(agent => 
      agent.perspectives?.includes(d.perspective) ||
      agent.questionTypes?.includes(d.perspective) ||
      agent.tags?.includes(d.perspective)
    );
  });
  
  return {
    covered: coveredDimensions.length,
    total: totalDimensions,
    ratio: coveredDimensions.length / totalDimensions,
    gaps: dimensions.filter(d => 
      !coveredDimensions.includes(d)
    )
  };
}
```

**关键点**: 
- 覆盖率基于**决策维度**而非问题类型
- 每个维度独立计算，权重相同
- 低于100%就补全（宁缺毋滥）
- 100%覆盖时不强制生成

### 3.3 动态生成的三层提示词构建

```javascript
function buildDynamicAgentPrompt(dimension, question, existingAgents) {
  return `
你是"演"的创造者模块，需要为决策维度「${dimension.name}」生成一个全新的智囊Agent。

【用户问题】「${question}」
【决策维度】${JSON.stringify(dimension)}
【不可与以下Agent视角重叠】
${existingAgents.map(a => `- ${a.name}: ${a.stance}`).join('\n')}

请生成一个Agent，输出JSON：
{
  "name": "2-3字中文名称，传统风格",
  "stance": "X视角 - 一句话说明这个视角的独特价值",
  "color": "#中国风传统色",
  "identity": "身份锚定：你是「XX」，[独特的角色定位]。
    核心价值观：[这个视角最看重什么]。
    红线：
    - [不做什么]
    - [不抢其他Agent的话]
    - [其他约束]",
  "methodology": "工作方法（按序执行）：
    1. [第一步：具体可执行的动作]
    2. [第二步]
    3. [第三步]
    4. [追问]",
  "deliverable": "交付标准（硬约束）：
    - 1-3句口语，≤80字
    - 必含一个[维度相关]的具体提问
    - [其他硬约束]
    - 若前面有智囊发言，必须对其至少一位做明确表态",
  "questionTypes": ["这个视角适用的问题类型"],
  "tags": ["动态生成", "${dimension.perspective}"],
  "perspectives": ["${dimension.perspective}"]
}

【规则】
1. identity必须独特，不与任何已有Agent重叠
2. methodology必须有4步，每步具体可执行
3. deliverable必须有硬约束
4. 名称用2-3字，传统风格 (如"旅悟""观途""行思")
5. 配色从中国风传统色中选取
6. 只返回JSON
`;
}
```

---

## 四、共享池设计

### 4.1 数据库Schema

```sql
-- 共享Agent池
CREATE TABLE shared_agents (
  id TEXT PRIMARY KEY,              -- "dyn_xxx" or "user_xxx"
  name TEXT NOT NULL,
  stance TEXT NOT NULL,
  color TEXT,
  glow TEXT,
  symbol TEXT,
  
  identity TEXT NOT NULL,           -- 三层提示词
  methodology TEXT NOT NULL,
  deliverable TEXT NOT NULL,
  persona TEXT,                     -- 向后兼容
  
  questionTypes JSON,               -- 擅长的问题类型
  perspectives JSON,                -- 覆盖的决策维度
  tags JSON,                        -- 标签
  
  source TEXT NOT NULL,             -- 'seed' | 'dynamic' | 'user'
  fingerprint TEXT,                 -- 生成时的维度指纹
  quality_score REAL DEFAULT 1.0,   -- 质量评分 (0-1)
  usage_count INTEGER DEFAULT 0,    -- 使用次数
  positive_feedback INTEGER DEFAULT 0,  -- 正面反馈数
  
  creator_id TEXT,                  -- 创造者ID (动态生成=null, 用户创建=userId)
  is_public INTEGER DEFAULT 1,      -- 是否公开 (用户创建可设为私有)
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived INTEGER DEFAULT 0
);

CREATE INDEX idx_shared_agents_fingerprint ON shared_agents(fingerprint);
CREATE INDEX idx_shared_agents_perspectives ON shared_agents(perspectives);
CREATE INDEX idx_shared_agents_source ON shared_agents(source);
CREATE INDEX idx_shared_agents_usage ON shared_agents(usage_count DESC);

-- 缓存命中日志 (用于分析和淘汰)
CREATE TABLE agent_usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  query_fingerprint TEXT,
  used_for TEXT,                    -- 问题摘要
  used_at INTEGER NOT NULL,
  FOREIGN KEY (agent_id) REFERENCES shared_agents(id)
);
```

### 4.2 Agent 指纹与匹配

```javascript
// 指纹 = 决策维度的hash
function computeFingerprint(dimensions) {
  const sortedPerspectives = dimensions
    .map(d => d.perspective)
    .sort()
    .join('+');
  return `fp_${hash(sortedPerspectives)}`;
}

// 匹配共享池
async function matchSharedPool(dimensions, question) {
  const fp = computeFingerprint(dimensions);
  
  // 1. 精确匹配: 相同指纹
  let agents = await db.query(
    'SELECT * FROM shared_agents WHERE fingerprint = ? AND archived = 0',
    [fp]
  );
  
  // 2. 宽匹配: 相似维度 (至少50%重叠)
  if (agents.length === 0) {
    const allActive = await db.query(
      'SELECT * FROM shared_agents WHERE archived = 0 AND source != "seed"'
    );
    agents = allActive.filter(agent => {
      const agentPerspectives = new Set(agent.perspectives);
      const dimensionPerspectives = new Set(dimensions.map(d => d.perspective));
      const overlap = [...agentPerspectives]
        .filter(p => dimensionPerspectives.has(p)).length;
      return overlap / dimensionPerspectives.size >= 0.5;
    });
  }
  
  // 3. 按使用次数和质量排序
  return agents.sort((a, b) => 
    (b.usage_count * b.quality_score) - (a.usage_count * a.quality_score)
  );
}
```

### 4.3 Agent 生命周期

```
                    ┌─────────────┐
                    │  演分析需求  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  生成/匹配   │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │  质量校验    │
                    │  (5项检查)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐  ┌─────────┐  ┌─────────┐
         │  通过    │  │  降权通过│  │  拒绝    │
         └────┬────┘  └────┬────┘  └────┬────┘
              │            │            │
              ▼            ▼            ▼
         ┌─────────────────────────────────────┐
         │           写入共享池                 │
         │                                     │
         │  - 新生成: INSERT                    │
         │  - 已存在: usage_count++, hit确认    │
         │  - 降权: quality_score *= 0.9       │
         └──────────────┬──────────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────────┐
         │           使用与反馈                 │
         │                                     │
         │  辩论中: 参与Blackboard             │
         │  辩论后: 用户可点赞/点踩             │
         │  点赞: positive_feedback++,        │
         │        quality_score = avg(quality,1)│
         │  点踩: quality_score *= 0.85        │
         └──────────────┬──────────────────────┘
                        │
                        ▼
         ┌─────────────────────────────────────┐
         │           归档与淘汰                 │
         │                                     │
         │  30天未使用 + score<0.6 → 归档      │
         │ 使用≥50次 → 永久保护                │
         │ 归档30天仍未恢复 → 删除             │
         └─────────────────────────────────────┘
```

---

## 五、演的Prompt设计

### 5.1 Phase 1: 分析Prompt

```
【演·分析Prompt】

你是"演"，推演核心，统揽全局的太极Agent。

你的任务：深度分析用户的决策问题，拆解开这个问题的核心矛盾和关键决策维度。

【用户问题】「{question}」

【可用Agent池(种子+共享)】
{allAgents.map(a => `- ${a.id}(${a.name}): ${a.stance} [perspectives: ${a.perspectives?.join(',')}]`).join('\n')}

【输出要求 - JSON格式】
{
  "analysis": "2-3句话深度分析，拆解核心矛盾",
  "dimensions": [
    {
      "name": "维度中文名",
      "perspective": "视角英文标签",
      "importance": 1-5,
      "description": "此维度的决策意义",
      "coveredBy": ["已有Agent ID列表"]
    }
  ],
  "coverage": {
    "covered": 3,
    "total": 5,
    "ratio": 0.6,
    "gaps": ["缺失的perspective标签"]
  },
  "reasoning": "分析过程简要说明"
}

【规则】
1. dimensions数量: 3-6个，必须覆盖问题核心矛盾
2. 每个dimension必须有明确的决策意义，不是表面分类
3. coveredBy必须准确引用已有Agent
4. coverage必须准确计算
5. 只返回JSON
```

### 5.2 Phase 2: 创造Prompt (缺失维度)

```
【演·创造Prompt】

你是"演"的创造者模块。需要为{missingDimensions.length}个缺失维度各生成一个全新的智囊Agent。

【用户问题】「{question}」
【需要生成的维度】
{missingDimensions.map(d => `- ${d.name} (${d.perspective}): ${d.description}`).join('\n')}

【已有Agent(不可重叠)】
{existingAgents.map(a => `- ${a.name}: ${a.stance}`).join('\n')}

【输出 - JSON数组】
[{
  "name": "2-3字中文",
  "stance": "X视角 - 独特价值",
  "color": "#中国风色",
  "identity": "你是「X」...核心价值观...红线...",
  "methodology": "工作方法:\n1. ...\n2. ...\n3. ...\n4. ...",
  "deliverable": "交付标准:\n- 1-3句≤80字\n- 必含...\n- ...",
  "questionTypes": ["..."],
  "perspectives": ["..."],
  "tags": ["动态生成", "..."]
}]

【规则】
1. 每个Agent的identity必须与已有Agent不重叠
2. methodology必须4步，可执行
3. deliverable必须有硬约束
4. 名字2-3字，传统风格
5. 配色用中国风传统色
6. 只返回JSON数组
```

---

## 六、统一API设计

```
POST /api/agent/analyze
  Body: { question, userId? }
  Response: {
    analysis: { ... },           // 演的分析结果
    dimensions: [ ... ],         // 决策维度
    coverage: { ... },           // 覆盖率
    seedAgents: [ ... ],         // 种子Agent (始终推荐)
    sharedAgents: [ ... ],       // 从共享池匹配的Agent
    generatedAgents: [ ... ],    // 本次新生成的Agent
    recommendedIds: [ ... ],     // 最终推荐列表
    totalCoverage: 0.85,         // 最终覆盖率
    cacheHit: true/false         // 是否命中缓存
  }

POST /api/agent/debate
  Body: { question, agentIds, userId?, memoryContext? }
  Response: {
    rounds: [ ... ],             // 辩论轮次
    blackboard: { ... },         // 黑板状态
    consensus: { ... },          // 共识点
    summary: "演的总结"
  }

GET /api/agent/pool
  Query: { source?, perspective?, search?, sort? }
  Response: {
    seed: [ ... ],
    shared: [ ... ],
    totalCount: 152,
    trending: [ ... ]            // 热门Agent
  }

POST /api/agent/custom
  Body: { agent, isPublic }
  Response: { id, ... }          // 保存到用户空间或贡献到共享池

GET /api/agent/trending
  Response: [                   // 热门Agent (按使用次数)
    { agent, usageCount, positiveRate }
  ]
```

---

## 七、前端交互设计

### 7.1 Agent选择界面 (重构)

```
┌─────────────────────────────────────────────┐
│  演已分析你的问题                            │
│  "我要不要去西藏"                            │
│                                             │
│  核心矛盾: 安全vs体验 · 时间vs意义           │
│  覆盖率: 83% (5/6维度已覆盖)                 │
│  新增: 旅悟(体验) 观途(目的地) ← 演创造的新视角│
│                                             │
│  ┌─ 种子智囊 (常驻) ──────────────────────┐ │
│  │ ☑ 风眼 · 风险视角                      │ │
│  │ ☑ 养生 · 身体视角                      │ │
│  │ ☑ 钱谷 · 财务视角                      │ │
│  │ ☑ 镜渊 · 反思视角                      │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│  ┌─ 共享智囊 (演匹配) ────────────────────┐ │
│  │ ☑ 旅悟 · 体验视角 ✨ [新生]             │ │
│  │   演为你的问题创造的新视角               │ │
│  │   [🔖 保存到我的智囊]                    │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│  ┌─ 我的智囊 ──────────────────────────────┐ │
│  │ ☐ (暂无自定义Agent)                     │ │
│  │ [+ 铸造新Agent]                          │ │
│  └─────────────────────────────────────────┘ │
│                                             │
│  选择至少3位智囊开始推演 →                    │
└─────────────────────────────────────────────┘
```

### 7.2 动态Agent标记

```
种子Agent:  [常驻] 钱谷 · 财务视角
共享Agent:  [共享] 旅悟 · 体验视角 ← 演创造，128人复用
用户Agent:  [我的] 随心 · 专属视角
新生标记:   ✨ [新生] ← 本次新生成
热门标记:   🔥 [热门] ← 被50+人使用
```

### 7.3 用户反馈闭环

```
辩论完成后:
  ┌─────────────────────────────────────┐
  │  各位智囊的发言对你有帮助吗？         │
  │                                     │
  │  [👍 有帮助] [👎 无用] [💡 建议改进]  │
  │                                     │
  │  旅悟(体验): 👍 128  👎 2            │
  │  观途(目的地): 👍 95  👎 5           │
  └─────────────────────────────────────┘
  
反馈影响:
  - 👍 +1: quality_score 提升
  - 👎 +1: quality_score 降低
  - quality_score < 0.5: 归档
  - quality_score > 0.9 && usage > 20: 标记"优质Agent"
```

---

## 八、实施计划 (分Step)

### Step 1: 后端基础 (预计3天)
- [ ] 统一Agent Schema 定义 (`server/src/data/agentSchema.js`)
- [ ] 重构 `agentPool.js` → `seedAgents.js` (仅种子层)
- [ ] 创建共享池数据库表 (`shared_agents`, `agent_usage_log`)
- [ ] 实现 `AgentRouter` 模块: 分析→匹配→生成→合成
- [ ] 实现 `DynamicGenerator` 模块: 三层提示词自动构建
- [ ] 实现 `QualityValidator` 模块: 5项校验
- [ ] 实现 `SharedPool` 模块: 匹配/写入/淘汰
- [ ] 新增/修改API: `analyze`, `pool`, `trending`

### Step 2: 前端对接 (预计2天)
- [ ] AgentDialogueOverlay 分层展示 (种子/共享/我的)
- [ ] 动态Agent标记 (新生/热门)
- [ ] 用户反馈闭环 (👍👎)
- [ ] 与铸造台联动 (保存动态Agent)
- [ ] 降级兼容 (后端不可达时用种子Agent)

### Step 3: 测试与调优 (预计2天)
- [ ] 多领域问题测试 (旅行/职业/健康/关系/创业)
- [ ] 缓存命中率测试
- [ ] 共享池生长测试 (模拟多用户)
- [ ] 质量校验调优
- [ ] 性能测试 (生成延迟<3s)

---

## 九、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| LLM生成Agent质量参差 | 低质量Agent污染共享池 | 5项校验+评分机制+社区反馈 |
| 共享池膨胀 | Agent过多难以匹配 | 淘汰机制+质量排序+热度过滤 |
| 生成Agent同质化 | 相似视角冗余 | 相似度检查，拒绝重叠 |
| 用户不理解"演创造Agent" | 困惑/不信任 | 清晰标记+引导文案+可保存 |
| Token消耗增加 | 成本上升 | 缓存复用+流式生成+预计算 |
| 恶意生成低质量Agent | 劣币驱逐良币 | 质量评分+社区审核+一键归档 |

---

## 十、与v1的核心差异

| 维度 | v1 (旧) | v2 (新) |
|------|---------|---------|
| Agent来源 | 固定12个 | 种子+演动态生成+用户共创 |
| 覆盖能力 | 预设领域 | **任何领域任何问题** |
| Agent归属 | 系统所有 | **共享生态**，所有人可贡献/复用 |
| 生长模式 | 静态 | **每次使用都可能扩展** |
| 匹配方式 | 关键词→ID | **演深度分析→维度匹配→缺失则生成** |
| 用户角色 | 消费者 | **消费者+共创者** |
| 缓存粒度 | 无 | **指纹缓存+相似度匹配** |
| 反馈机制 | 无 | **👍👎→质量评分→淘汰/保护** |
