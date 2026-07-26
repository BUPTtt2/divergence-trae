# 演策项目交接文档 · 给新 Trae 的第一封信

> **你是新接手的 Trae。这份文档让你在 10 分钟内理顺整个项目，不用从头翻代码。**
> 最后更新：2026-07-25
> 仓库：https://github.com/BUPTtt2/divergence-trae.git
> 克隆后读 `main` 分支即可拿到最新代码

---

## 第一步：新 Trae 环境配置（你必读，先做这个）

### 1.1 克隆项目
```bash
git clone https://github.com/BUPTtt2/divergence-trae.git
cd divergence-trae
npm install        # 前端依赖
cd server
npm install        # 后端依赖（单独的 package.json）
cd ..
```

### 1.2 创建 .env 文件（必做，否则本地后端跑不起来）

.env 文件被 .gitignore 忽略，不会随仓库提交。你需要手动创建：

**前端 `.env.development`**（从 `.env.example` 复制后修改）：
```bash
# Windows PowerShell
Copy-Item .env.example .env.development
```
内容改为：
```
VITE_API_BASE=http://localhost:3001
VITE_SIGNING_SECRET=dev_secret_key
VITE_APP_VERSION=1.3.0
```

**后端 `server/.env`**（从 `server/.env.example` 复制后填入）：
```bash
cd server
Copy-Item .env.example .env
```
必填项：
```
ZHIPU_API_KEY=你的智谱API Key  # 去 https://open.bigmodel.cn/ 申请
ZHIPU_MODEL=glm-4-flash
PORT=3001
CORS_ORIGIN=http://localhost:5173
```
> 如果没有智谱 API Key，后端不跑也行——前端有 localStorage 降级，核心推演流程照样能走通（只是智囊发言用本地预设模板）。

### 1.3 你的 Trae 工作区规则配置

#### CLAUDE.md（已随仓库提交，自动生效）
项目根目录的 `CLAUDE.md` 是产品梳理文档，Trae 会自动读取。**不需要额外配置**。

#### 用户偏好规则（已随仓库提交）
`CLAUDE.md` 和 `docs/AGENT_DESIGN.md` 里包含了所有硬约束（视觉风格、动效、智囊呈现等）。Trae 会自动遵守。

#### MCP 工具（可选，本项目不强依赖任何 MCP）
- `mcp_Figma_AI_Bridge` — Figma 设计稿转代码（如需从 Figma 导入设计时用）
- `mcp_Sequential_Thinking` — 复杂推理链（可选）
- `mcp_memory` — 跨会话记忆（可选）

**本项目开箱即用，无需安装额外 MCP/Skill/Hook。**

### 1.4 跑起来
```bash
# 前端（必须）
npm run dev    # → http://localhost:5173

# 后端（可选，无后端前端也能跑核心流程）
cd server
npm run dev    # → http://localhost:3001
```

---

## 第二步：当前已部署状态（不是让你部署，是告诉你现在跑了什么）

### 生产环境（已部署，运行中）

| 组件 | 平台 | 地址 | 状态 | 说明 |
|------|------|------|------|------|
| 前端 | Surge | https://yance-bagua.surge.sh | ✅ 运行中 | `npm run build` + `npx surge dist yance-bagua.surge.sh` 部署 |
| 后端 | Railway | https://yance-bagua-engine-production.up.railway.app | ✅ 运行中 | `cd server && railway up` 部署 |
| LLM | 智谱 GLM-4-Flash | 后端 `llmRouter.js` 调用 | ✅ 正常 | API Key 在 Railway 环境变量里 |

### 前端环境变量（已配置）
- `.env.production`：`VITE_API_BASE=https://yance-bagua-engine-production.up.railway.app`
- `public/api-config.js`：`window.__API_BASE__ = 'https://yance-bagua-engine-production.up.railway.app'`

### 后端环境变量（在 Railway Dashboard，**不提交到 git**）
- `LLM_API_KEY` — 智谱 API Key
- `LLM_MODEL` — `glm-4-flash`
- `JWT_SECRET` — JWT 签名密钥
- `NODE_ENV` — `production`

### Git 分支状态
| 分支 | 用途 | 状态 |
|------|------|------|
| `main` | 主分支 | ✅ 已合并最新代码 |
| `cloudflare-workers` | Cloudflare Workers 后端（备用） | 不启用，保留代码 |

**新 Trae 克隆 main 分支即可拿到全部最新代码和文档。**

---

## 第三步：先读这 4 个文档（必读，按顺序）

| 顺序 | 文档 | 作用 | 什么时候读 |
|------|------|------|-----------|
| 1 | **`docs/AGENT_DESIGN.md`** | Agent 架构 + 工作流可视化 + prompt配置中心 + 五视角商业蓝图 + 技术债 + ADR | **改任何 Agent 行为/prompt/工作流前必读** |
| 2 | **`CLAUDE.md`** | 产品梳理 + 前后端 API 对照表 + 修复记录 | 查 API 路径/认证策略/排查问题时读 |
| 3 | **`PROJECT_STATUS.md`** | 当前功能完成度 + 待办任务 + 已知问题 | 接手时读，了解"现在在哪、要去哪" |
| 4 | **`DEPLOYMENT_GUIDE.md`** | 部署完整指南（Railway/Surge） | 需要重新部署时读 |

**其他文档**（按需读）：
- `最新任务.md` — 历史任务追踪（较旧，最新状态看 PROJECT_STATUS.md）
- `docs/` 目录 — 设计方案、需求沉淀、补充材料等历史文档

---

## 第四步：理解项目全貌（5 分钟）

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

## 第五步：理解 Agent 架构（核心壁垒）

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

## 第六步：当前已完成什么 + 要做什么

### 已完成（✅ 全部已上线）
1. ✅ 11 阶段推演全流程可走通（input → final）
2. ✅ 多智囊辩论 + Blackboard 协作 + Wald SPRT 收敛检测
3. ✅ 智囊调校迭代（受用/失言反馈 → 下次发言注入）
4. ✅ 决策回顾闭环（30天回访 + 结局对照 + 卦中/卦偏命中标识）
5. ✅ 智囊市集（发布/订阅他人智囊）
6. ✅ 命签深化（Canvas 分享 PNG + 翻卦交互 + 推演路径回看）
7. ✅ 演思考过程可视化（4步流：读问题→召回记忆→匹配智囊→预判分歧）
8. ✅ Agent 对话 400 问题过长修复（上下文预算控制≤480字 + 降级重试）
9. ✅ 5步智囊铸造向导（赐名→关系→审问→封印→入营）
10. ✅ 每日卦签（日期hash固定一卦+连续签到）
11. ✅ 成就系统（6级：初入卦门→大衍之数）
12. ✅ 法律合规（用户协议+隐私政策+AI生成标识）
13. ✅ 首访引导（5.8s惊艳序列）
14. ✅ 悬浮配件4模式（☯罗盘/外铜钱/书演字/笔笔锋）

### 待办任务（详细，新 Trae 按此执行）

#### P0 — 必须做（上线前）
**任务：persona/prompt 前后端统一收敛到后端**
- **现状**：前端 `src/services/inferenceEngine.js` 的 `AGENT_PERSONAS` 对象和后端 `server/src/data/agentPool.js` 双份维护智囊人设。改 prompt 要改两处，容易不一致。
- **目标**：后端 `agentPool.js` 作为单一来源，前端通过 API 获取 persona（或后端在 dialogue 时直接注入 system prompt），前端 `AGENT_PERSONAS` 只做本地降级兜底。
- **涉及文件**：
  - `server/src/data/agentPool.js` — 权威 persona 来源
  - `server/src/routes/agent.js` — dialogue 接口已支持 agentConfig 参数
  - `src/services/inferenceEngine.js` — 前端 AGENT_PERSONAS 降级为 fallback
  - `docs/AGENT_DESIGN.md` — 更新配置中心表格
- **验证**：改一个智囊的 persona（只改后端），前端发言立即生效

#### P1 — 重要（上线后优先）
**任务1：智囊工具调用（搜索/日历/股价）→ 真 Agent**
- **现状**：智囊是"prompt 限制的 LLM"，无任何工具调用能力
- **目标**：智囊可调用搜索（查行业信息）、日历（查时间冲突）、股价等工具
- **价值**：从"prompt限制的LLM"升级为"真Agent"，最大技术壁垒跃迁
- **涉及**：`server/src/services/agentEngine.js` + 新增 tool 定义层

**任务2：上线埋点 + 错误率告警**
- **现状**：无任何埋点，不知道用户在哪流失
- **目标**：埋点首签完成率 / 辩论LLM成功率 / 400错误率 / 分享率 / 回访回填率
- **涉及**：前端 `apiClient.js` 加埋点上报 + 后端新增 `/api/metrics` 路由

**任务3：Blackboard 真消息传递**
- **现状**：单向订阅（后续智囊看前面发言），伪协作
- **目标**：智囊可互相 @反驳 追问
- **涉及**：`src/services/multiAgentFramework.js` 升级 publish/observe

#### P2 — 长期
**任务4：记忆云端同步** — 已登录用户跨设备留存
**任务5：社区智囊生态打磨** — 市集推荐位 + UGC护城河
**任务6：移动端适配** — 响应式布局

#### P3 — 优化
**任务7：Bundle 压缩** — vendor-three已分包，可再懒加载
**任务8：Prompt注入防护加固** — 用户问题不能直接进入system prompt

### 已知问题
1. **MIME type 错误**：Surge 部署后偶现 `Failed to load module script: MIME type "text/html"`，硬刷新或重新部署可解
2. **智囊阁加载失败**：浏览器缓存旧 hash 文件，已有 lazyRetry 重试机制
3. **Prompt 双份维护**：前端 `AGENT_PERSONAS` 和后端 `agentPool.js` 不完全一致，P0 待统一

---

## 第七步：改代码前必须遵守的规则

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

## 第八步：常用命令

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
git push origin main
```

---

## 第九步：关键文件速查

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
5. **部署相关**：用户明确说"不要部署 Cloudflare，用 Railway"，worker 目录代码保留在 github 但不启用。
6. **文档更新纪律**：改了架构/prompt/工作流，先改 `docs/AGENT_DESIGN.md`；完成了任务，更新 `PROJECT_STATUS.md`。
7. **用户沟通语言**：中文。所有直接沟通用中文。
8. **用户技术背景**：熟悉 Phaser 框架，本地服务器测试，偏好"简洁高效"的沟通。

---

## 第十步：首次验证清单（确认"能跑了"）

新 Trae 接手后，完成以下验证，确认环境 OK：

```bash
# 1. 前端能启动
npm run dev
# → 访问 http://localhost:5173 能看到首页引导动画

# 2. 后端能启动（可选）
cd server && npm run dev
# → 访问 http://localhost:3001/health 返回 {"status":"ok"}

# 3. 推演流程能走通
# → 点"立卦开演" → 输入"要不要接那个新 Offer？"
# → 看到演析问 → 选智囊 → 看到智囊辩论 → 演总结
# → 占卜 → 命牌浮层 → 抉择 → 命签收藏

# 4. 命签收藏能打开
# → 访问 /cards 页面能看到刚收藏的命签

# 5. 每日卦签能打开
# → 访问 /daily 页面能看到今日卦象
```

**如果 1、3、4、5 都 OK，环境就通了。** 后端（2）可选。

---

## 第十一步：分支策略与开发规范

### 分支策略
```bash
# 新 Trae 在 main 基础上新建开发分支
git checkout main
git checkout -b feat/你的任务名

# 开发完成后合并回 main
git checkout main
git merge feat/你的任务名 --no-edit
git push origin main

# 不要直接在 main 上改代码
```

### PowerShell 注意事项（Windows 用户）
```bash
# ❌ 不要用 heredoc（PowerShell 不支持）
git commit -m "$(cat <<'EOF'
消息
EOF
)"

# ✅ 用简单 -m
git commit -m "docs: 项目文档沉淀"

# 多行消息用多个 -m
git commit -m "feat: 标题" -m "详细描述"
```

### CRLF/LF 警告
Windows 上 git 会警告 `LF will be replaced by CRLF`，这是正常的，不影响功能。

---

## 第十二步：防断保障（怎么保证在我这里不会断）

> 这是专门回答"怎么保证在另一台电脑不会断"的章节。

### 1. 文档自包含（不依赖对话历史）
所有信息都在文档里，不依赖任何对话上下文：
- **项目全貌** → `HANDOVER_TO_NEW_TRAE.md` 第三~五步
- **当前状态** → `PROJECT_STATUS.md`
- **架构决策** → `docs/AGENT_DESIGN.md`
- **API 对照** → `CLAUDE.md`
- **部署状态** → `HANDOVER_TO_NEW_TRAE.md` 第二步
- **待办任务** → `HANDOVER_TO_NEW_TRAE.md` 第六步（详细到文件级别）
- **硬约束** → `HANDOVER_TO_NEW_TRAE.md` 第七步

**新 Trae 不需要任何对话历史，只读文档就能理顺。**

### 2. 每步都有验证标准
- 环境配置 → 第十步验证清单
- 每个待办任务 → 都有"涉及文件"和"验证方法"
- 部署 → `DEPLOYMENT_GUIDE.md` 有检查清单

### 3. 本地降级兜底（永不白屏）
- 无后端 → 前端 localStorage 降级，核心推演流程照样走通
- 无 LLM → 本地预设模板发言（`inferenceEngine.js` 的 `SMART_PRESETS`）
- 无网络 → 所有核心功能离线可用

### 4. 用户偏好完整传递
用户的所有偏好已固化在以下位置（随仓库提交）：
- `CLAUDE.md` — 产品梳理 + 约束
- `docs/AGENT_DESIGN.md` — 硬约束 + ADR 决策记录
- `HANDOVER_TO_NEW_TRAE.md` 第七步 — 10 条硬约束清单

**关键用户偏好**（新 Trae 必须遵守）：
1. 沟通语言：中文
2. 视觉风格：水墨八卦虚空，动效克制（0.8-1.5s，无弹跳/爆炸/震屏）
3. 智囊呈现：半透明虚影方块/符号（不是塔楼/建筑）
4. 智囊对话：纯浮动文字（无气泡框），4.5s 自动消失
5. 每个环节等待用户点击继续
6. Agent 提问递进式，简短有力
7. 部署用 Railway + Surge（不用 Cloudflare）
8. 所有 LLM 调用有本地降级
9. 全站「AI生成内容，仅供参考」标识
10. 做到哪一步就用选择题工具问后续，不要停

### 5. 代码可追溯
- 所有改动都有 git commit
- 重大决策有 ADR 记录（`docs/AGENT_DESIGN.md` §6）
- 修复记录在 `CLAUDE.md` 的修复记录表

### 6. 如果新 Trae 遇到问题
- **白屏** → 检查浏览器控制台，大概率是 MIME type 问题，硬刷新
- **智囊不发言** → 检查后端是否启动，或检查 `inferenceEngine.js` 本地降级
- **API 404** → 查 `CLAUDE.md` 的前后端 API 对照表
- **400 问题过长** → 已修复，检查 `inferenceEngine.js` 的 MAX_Q=480
- **智囊阁加载失败** → lazyRetry 自动重试，或硬刷新
- **Git 推送失败** → 国内网络问题，开代理后重试

---

**祝你在演策项目里 coding 愉快。记住：Harness 优先于模型，本地降级永远兜底，体验稳定 > 内容完美。**
