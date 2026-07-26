# 演策项目交接文档 · 给新 Trae 的第一封信

> **你是新接手的 Trae。这份文档让你在 10 分钟内理顺整个项目，不用从头翻代码。**
> 最后更新：2026-07-25
> 仓库：https://github.com/BUPTtt2/divergence-trae.git
> 当前分支：`feat/p0-fix-fate-deepen`（主分支 `main`）

---

## 第一步：克隆并跑起来（3 分钟）

```bash
git clone https://github.com/BUPTtt2/divergence-trae.git
cd divergence-trae
npm install
npm run dev    # → http://localhost:5173
```

**后端**（本地可选，前端有 localStorage 降级，无后端也能跑核心流程）：
```bash
cd server
npm install
npm run dev    # → http://localhost:3001
```

**生产后端**（已部署，前端默认连这个）：
```
https://yance-bagua-engine-production.up.railway.app
```

**前端生产**（已部署）：
```
https://yance-bagua.surge.sh
```

---

## 第二步：先读这 3 个文档（必读，按顺序）

| 顺序 | 文档 | 作用 | 什么时候读 |
|------|------|------|-----------|
| 1 | **`docs/AGENT_DESIGN.md`** | Agent 架构 + 工作流可视化 + prompt配置中心 + 五视角商业蓝图 + 技术债 + ADR | **改任何 Agent 行为/prompt/工作流前必读** |
| 2 | **`CLAUDE.md`** | 产品梳理 + 前后端 API 对照表 + 修复记录 | 查 API 路径/认证策略/排查问题时读 |
| 3 | **`PROJECT_STATUS.md`** | 当前功能完成度 + 待办任务 + 已知问题 | 接手时读，了解"现在在哪、要去哪" |

**其他文档**（按需读）：
- `DEPLOYMENT_GUIDE.md` — 部署到 Railway/Surge/Cloudflare 的完整步骤
- `最新任务.md` — 历史任务追踪（较旧，最新状态看 PROJECT_STATUS.md）
- `docs/` 目录 — 设计方案、需求沉淀、补充材料等历史文档

---

## 第三步：理解项目全貌（5 分钟）

### 这是什么产品
**演策** = AI 决策推演沙盘。用户抛出真实纠结（辞职/Offer/创业/感情）→ 演（主Agent）析问 → 召唤多视角智囊辩论 → 占卜立卦 → 用户抉择 → 生成可收藏可分享的命签。

### 核心技术栈
- **前端**：React 19 + Vite 8 + Three.js（3D 推演台）+ Framer Motion + Tailwind CSS
- **后端 A（当前用）**：Express + Railway，见 `server/` 目录
- **后端 B（备用）**：Hono + Cloudflare Workers + D1 + KV，见 `worker/` 目录
- **LLM**：GLM-4-Flash（通过 `server/src/services/llmRouter.js` 调用）

### 项目结构（3 层）
```
sandbox-app/
├── src/              # 前端（React + Three.js）
│   ├── pages/        # Game(推演台) / Collection(命签) / Agents(智囊阁) / Daily(日签) 等
│   ├── components/   # board/(3D场景) / agent/ / fate/ / fx/ / layout/
│   ├── services/     # inferenceEngine(核心推理) / apiClient / memoryStore / multiAgentFramework
│   ├── data/         # agents(智囊定义) / wisdomHexagrams(卦象库) / scripts
│   └── utils/        # shareCardGenerator(命签PNG) / customAgent / trigramTextures
├── server/           # 后端 A（Express + Railway，当前生产用）
│   └── src/
│       ├── routes/   # agent / yan / divination / cards / advisors / daily / followUp / sync
│       ├── services/ # agentEngine(LLM编排) / yanChatService / yiJingEngine / memoryService
│       └── data/     # agentPool(智囊人设) / hexagrams(64卦数据)
├── worker/           # 后端 B（Hono + Cloudflare Workers，备用，未启用）
└── docs/             # 所有设计文档和补充材料
```

### 核心流程（用户视角）
```
用户输入问题
  → POST /api/agent/analyze（匹配智囊）
  → POST /api/yan/chat/stream（演析问+追问）
  → POST /api/agent/dialogue（智囊顺序发言，多轮辩论≤3轮）
  → POST /api/agent/summary（演总结+点出选择模式）
  → POST /api/divination/cast（起卦）
  → POST /api/divination/interpret（解卦）
  → POST /api/cards（保存命签）
  → 30天后 POST /api/followUp（决策回访闭环）
```

---

## 第四步：理解 Agent 架构（核心壁垒）

> 详见 `docs/AGENT_DESIGN.md`，这里是要点。

### 11 阶段状态机（Game.jsx）
`input → casting → analyzing → summoning → yan_analyze → agent_select → agent_debate → reflecting → summary → oracle_prompt → oracle → path_reveal → committing → final`

### 智囊三层提示词
```
【identity】persona（20年CFO/心理咨询师…）→ 让LLM"成为这个人"
【methodology】先看账/先问感受/先泼冷水… → 决定"怎么想"
【deliverable】1-3句≤80字/口语/抓具体词/可反问 → 决定"怎么输出"
```

### 多 Agent 协作
- **Blackboard 黑板模式**：智囊发言 publish 到黑板，后续智囊可 observe 订阅
- **Wald SPRT 收敛**：3 信号判断收敛（轮次≤3 / 共识分≥0.8 / 循环检测相似度）
- **上下文预算控制**：前端拼接上下文 ≤480 字（后端校验 500 字），超限自动截断，400 错误时降级为纯问题重试

### 记忆系统（4 层）
- `working`（当前会话） / `facts`（用户事实） / `episodes`（决策事件） / `semantic`（长期画像）
- 存储：localStorage（本地降级）+ 后端 API（已登录用户）
- **决策回顾闭环**：saveEpisode(30天到期) → 演主动回访 → 用户回填结局 → 卦象准度校准

### 智囊调校迭代
用户点「受用/失言」→ saveAgentFeedback → 下次发言 formatFeedbackForPrompt 注入 → 智囊越用越准

---

## 第五步：知道当前状态和待办

> 详见 `PROJECT_STATUS.md`，这里是要点。

### 已完成（✅）
- 11 阶段推演全流程可走通
- 多智囊辩论 + Blackboard 协作 + 收敛检测
- 智囊调校迭代（受用/失言反馈）
- 决策回顾闭环（30天回访 + 结局对照 + 卦中/卦偏标识）
- 智囊市集（发布/订阅他人智囊）
- 命签深化（Canvas 分享 PNG + 翻卦交互 + 推演路径回看）
- 演思考过程可视化（4步流：读问题→召回记忆→匹配智囊→预判分歧）
- Agent 对话 400 问题过长修复（上下文预算控制 + 降级重试）
- 5步智囊铸造向导（赐名→关系→审问→封印→入营）
- 每日卦签 + 成就系统 + 法律合规页面

### 待办（按优先级）
| 优先级 | 任务 | 说明 |
|--------|------|------|
| **P0** | persona/prompt 前后端统一收敛到后端 | 现在前端 `inferenceEngine.js` 和后端 `agentPool.js` 双份维护，改 prompt 要改两处 |
| **P1** | 智囊工具调用（搜索/日历/股价） | 从"prompt限制的LLM"升级为"真Agent"，最大技术壁垒跃迁 |
| **P1** | 上线埋点 + 错误率告警 | 数据驱动迭代的前提（首签完成率/LLM成功率/分享率/回访回填率）|
| **P2** | 记忆云端同步 | 已登录用户跨设备留存 |
| **P2** | 社区智囊生态打磨 | 市集推荐位 + UGC 护城河 |
| **P3** | Bundle 压缩 | vendor-three 已分包，可再懒加载 |

### 已知问题
1. **MIME type 错误**：Surge 部署后偶现 `Failed to load module script: MIME type "text/html"`，硬刷新或重新部署可解
2. **智囊阁加载失败**：浏览器缓存旧 hash 文件，已有 lazyRetry 重试机制
3. **Prompt 双份维护**：前端 `AGENT_PERSONAS` 和后端 `agentPool.js` 不完全一致，P0 待统一

---

## 第六步：改代码前必须遵守的规则

### 硬约束（来自用户偏好，不可违反）
1. **视觉风格**：水墨八卦虚空，底色 `#FAF8F0`，动效克制（0.8-1.5s 缓入缓出，**无弹跳/爆炸/震屏**）
2. **智囊呈现**：半透明虚影方块/符号，悬浮，有颜色光晕，围绕用户八卦式环绕，**不是塔楼/建筑/复杂角色**
3. **智囊对话**：纯浮动文字（**无气泡框**），浮在智囊上方，4.5s 自动消失
4. **每个环节必须等待用户点击继续**，不能自动跳转
5. **不要**：屏幕震动/天/地/雷/风悬浮助手/金色背景圆环/'演'字周围4个悬浮小符
6. **Agent 提问必须递进式**，基于历史对话问更深层次问题，简短有力
7. **部署用 Railway**（不用 Cloudflare），前端用 Surge
8. **所有 LLM 调用必须有本地降级**，永不白屏/卡死
9. **全站「AI生成内容，仅供参考」标识**
10. **vite.config.js 的 `base: './'`** 确保相对路径

### 改动纪律
- 改任何 Agent 行为/prompt/工作流 → **先改 `docs/AGENT_DESIGN.md`，再改代码**
- 改 API 路径 → **同步更新 `CLAUDE.md` 的前后端对应表**
- 完成任务 → **更新 `PROJECT_STATUS.md` 的完成度**

---

## 第七步：常用命令

```bash
# 开发
npm run dev                    # 前端开发服务器 localhost:5173
cd server && npm run dev       # 后端开发服务器 localhost:3001

# 构建
npm run build                  # 产物在 dist/

# 部署前端（Surge）
npm run build
npx surge dist yance-bagua.surge.sh

# 部署后端（Railway）
cd server
railway login
railway up

# Git
git status
git log --oneline -10
git push origin feat/p0-fix-fate-deepen
```

---

## 第八步：关键文件速查

| 要改什么 | 看哪个文件 |
|----------|-----------|
| 推演流程状态机 | `src/pages/Game.jsx`（核心，~2000行）|
| 智囊人设/prompt | `src/services/inferenceEngine.js`（前端）+ `server/src/data/agentPool.js`（后端）|
| 智囊辩论编排 | `src/services/inferenceEngine.js` 的 `generateDialoguesForAgents` |
| Blackboard 协作 | `src/services/multiAgentFramework.js` |
| 记忆系统 | `src/services/memoryStore.js` |
| 后端 LLM 编排 | `server/src/services/agentEngine.js` |
| 卦象数据 | `server/src/data/hexagrams.json` + `src/data/wisdomHexagrams.js` |
| 命签分享卡 | `src/utils/shareCardGenerator.js` |
| 3D 场景布局 | `src/components/board/layoutConfig.js` |
| API 客户端 | `src/services/apiClient.js` |
| 后端路由 | `server/src/routes/agent.js`（智囊）/ `yan.js`（演）/ `divination.js`（卦）|

---

## 给新 Trae 的建议

1. **先读文档再动代码**。这个项目已经迭代了很久，很多决策有 ADR 记录，不要重复踩坑。
2. **改 prompt 前先读 `docs/AGENT_DESIGN.md` 的 §1.3 三层提示词结构**。
3. **前端改动后本地测一次完整推演流程**（输入问题→辩论→占卜→命签→收藏→回看）。
4. **用户偏好"做到哪一步就用选择题工具问后续，不要停"**——每完成一个里程碑就问下一步。
5. **部署相关**：用户明确说"不要部署 Cloudflare，用 Railway"，worker 目录代码保留在 github 分支但不启用。
6. **文档更新纪律**：改了架构/prompt/工作流，先改 `docs/AGENT_DESIGN.md`；完成了任务，更新 `PROJECT_STATUS.md`。

---

**祝你在演策项目里 coding 愉快。记住：Harness 优先于模型，本地降级永远兜底，体验稳定 > 内容完美。**
