# 演策项目状态总览

> 最后更新：2026-07-25
> 分支：`feat/p0-fix-fate-deepen`
> 最新提交：`479423b fix(P0)+docs: 修复Agent对话400问题过长 + 新增AGENT_DESIGN权威蓝图`

---

## 一、功能完成度

### 核心推演流程（✅ 全部完成）
| 阶段 | 功能 | 状态 | 关键文件 |
|------|------|------|----------|
| 输入问题 | 用户输入决策问题 | ✅ | `Game.jsx` input 阶段 |
| 起卦动画 | 三枚铜钱水墨翻滚1.5s | ✅ | `Game.jsx` casting 阶段 |
| 演析问 | LLM分析问题+递进追问+思考过程可视化 | ✅ | `Game.jsx` yan_analyze 阶段 |
| 智囊选择 | 侧边栏选择参与讨论的智囊 | ✅ | `Game.jsx` agent_select 阶段 |
| 智囊辩论 | 多轮辩论≤3轮，Blackboard协作 | ✅ | `inferenceEngine.js` generateDialoguesForAgents |
| 演总结 | LLM总结+点出选择模式 | ✅ | `Game.jsx` summary 阶段 |
| 占卜立卦 | 起卦+解卦 | ✅ | `Game.jsx` oracle 阶段 |
| 命牌展示 | 卦象/卦名/卦辞/四柱/智囊批注/抉择/终局/承诺 | ✅ | `Game.jsx` path_reveal 阶段 + FateCardPanel |
| 用户抉择 | 选择路径+本心落笔 | ✅ | `Game.jsx` committing→final 阶段 |
| 命签收藏 | 保存到收藏页 | ✅ | `Collection.jsx` |

### Agent 系统（✅ 核心完成，P0/P1 待升级）
| 功能 | 状态 | 说明 |
|------|------|------|
| 11阶段状态机 | ✅ | Game.jsx 硬编码推进 |
| 多智囊辩论 | ✅ | 顺序发言 + Blackboard + 收敛检测 |
| 三层提示词 | ✅ | identity/methodology/deliverable（前端+后端双份，P0待统一） |
| 上下文预算控制 | ✅ | ≤480字，超限截断，400降级重试 |
| 智囊调校迭代 | ✅ | 受用/失言反馈 → 下次发言注入 |
| 演思考可视化 | ✅ | 4步流：读问题→召回记忆→匹配智囊→预判分歧 |
| 自定义智囊铸造 | ✅ | 5步向导：赐名→关系→审问→封印→入营 |
| Blackboard协作 | ⚠️ | 单向订阅（伪协作），P1升级为真消息传递 |
| 工具调用 | ❌ | 无工具调用，P1优先开发 |
| 记忆云端同步 | ⚠️ | localStorage已落地，云端同步P2 |

### 记忆与决策闭环（✅ 完成）
| 功能 | 状态 | 关键函数 |
|------|------|----------|
| 4层记忆系统 | ✅ | `memoryStore.js` working/facts/episodes/semantic |
| 决策事件保存 | ✅ | `saveEpisode` 30天到期 |
| 演主动回访 | ✅ | YanChat打开时检测到期followUp |
| 结局对照 | ✅ | `Collection.jsx` 卦中/卦偏命中标识 |
| 选择模式检测 | ✅ | `detectChoicePattern` ≥3次演主动点出 |

### 社区与生态（✅ 基础完成）
| 功能 | 状态 | 说明 |
|------|------|------|
| 智囊市集 | ✅ | 发布/订阅他人智囊 |
| 智囊社区展示 | ✅ | Community页面 |
| 推演记录去重 | ✅ | includes方法 |

### 命签深化（✅ 完成）
| 功能 | 状态 | 关键文件 |
|------|------|----------|
| Canvas分享PNG | ✅ | `shareCardGenerator.js` 800×1100水墨风格 |
| 翻卦交互 | ✅ | 命牌浮层卦象翻卦 |
| 推演路径回看 | ✅ | Collection.jsx ☳回看 模态框 |
| 个性化命签生成 | ✅ | LLM生成卦辞+终局，本地降级模板 |

### 辅助功能（✅ 完成）
| 功能 | 状态 |
|------|------|
| 每日卦签（日期hash固定一卦+连续签到） | ✅ |
| 成就系统（6级：初入卦门→大衍之数） | ✅ |
| 解卦（8组关键词匹配+随机配卦） | ✅ |
| 法律合规（用户协议+隐私政策+AI生成标识） | ✅ |
| 首访引导（5.8s惊艳序列） | ✅ |
| 悬浮配件4模式（☯罗盘/外铜钱/书演字/笔笔锋） | ✅ |

---

## 二、待办任务（按优先级）

### P0 — 必须做（上线前）
| 任务 | 说明 | 预估工作量 |
|------|------|-----------|
| **persona/prompt 前后端统一收敛到后端** | 前端`inferenceEngine.js`的`AGENT_PERSONAS`和后端`agentPool.js`双份维护，改prompt要改两处。收敛为后端单一来源，前端只读 | 中 |
| 验证完整推演流程无报错 | 本地跑一遍 input→final 全流程 | 小 |

### P1 — 重要（上线后优先）
| 任务 | 说明 | 价值 |
|------|------|------|
| **智囊工具调用** | 搜索/日历/股价 → 真Agent标志 | 最大技术壁垒跃迁 |
| **上线埋点+错误率告警** | 首签完成率/LLM成功率/分享率/回访回填率 | 数据驱动迭代前提 |
| Blackboard真消息传递 | 智囊可互相@反驳追问 | 从伪协作到真协作 |

### P2 — 长期
| 任务 | 说明 |
|------|------|
| 记忆云端同步（已登录用户） | 跨设备留存 |
| 社区智囊生态打磨 | 市集推荐位 + UGC护城河 |
| 移动端适配 | 响应式布局 |

### P3 — 优化
| 任务 | 说明 |
|------|------|
| Bundle压缩 | vendor-three已分包，可再懒加载 |
| Prompt注入防护加固 | 用户问题不能直接进入system prompt |

---

## 三、已知问题

| # | 问题 | 状态 | 临时方案 |
|---|------|------|----------|
| 1 | Surge部署后偶现 MIME type "text/html" 错误 | ⚠️ 已知 | 硬刷新或重新部署 |
| 2 | 智囊阁加载失败（浏览器缓存旧hash） | ⚠️ 已有lazyRetry | 自动重试+刷新 |
| 3 | Prompt前后端双份维护 | ❌ 待P0统一 | 改prompt时手动改两处 |
| 4 | worker目录代码未启用 | ℹ️ 设计 | 保留在github分支，不部署 |

---

## 四、部署状态

### 当前生产环境
| 组件 | 平台 | 地址 | 状态 |
|------|------|------|------|
| 前端 | Surge | https://yance-bagua.surge.sh | ✅ 运行中 |
| 后端 | Railway | https://yance-bagua-engine-production.up.railway.app | ✅ 运行中 |
| LLM | 智谱GLM-4-Flash | 通过后端 llmRouter.js 调用 | ✅ 正常 |

### 部署命令
```bash
# 前端部署
npm run build
npx surge dist yance-bagua.surge.sh

# 后端部署
cd server
railway login
railway up
```

### 环境变量
- 前端：`.env.production` → `VITE_API_BASE=https://yance-bagua-engine-production.up.railway.app`
- 运行时：`public/api-config.js` → `window.__API_BASE__`
- 后端：Railway 环境变量（LLM API Key、JWT_SECRET 等，**不提交到git**）

---

## 五、Git 状态

### 分支
| 分支 | 用途 | 状态 |
|------|------|------|
| `main` | 主分支 | 稳定，可部署 |
| `feat/p0-fix-fate-deepen` | P0修复+命牌深化+决策闭环 | **当前开发分支**，最新代码 |
| `cloudflare-workers` | Cloudflare Workers后端（备用） | 不启用，保留代码 |

### 最近提交
```
479423b fix(P0)+docs: 修复Agent对话400问题过长 + 新增AGENT_DESIGN权威蓝图
a599737 perf(分包+对照): vite manualChunks细化 + 结局对照加卦中/卦偏标识
0d54888 feat(命牌): 命牌深化全部做 - 分享卡/翻卦交互/推演路径回看
f201846 feat: P0修复 + 命牌深化 + 决策回顾闭环 + 智囊市集
```

---

## 六、文档索引

| 文档 | 作用 |
|------|------|
| `HANDOVER_TO_NEW_TRAE.md` | **给新Trae的交接文档**（最先读这个）|
| `docs/AGENT_DESIGN.md` | Agent架构+商业蓝图权威文档 |
| `CLAUDE.md` | 产品梳理+API对照表+修复记录 |
| `DEPLOYMENT_GUIDE.md` | 部署完整指南 |
| `最新任务.md` | 历史任务追踪（较旧） |
| `docs/00-问题定义.md` ~ `05-项目上线文档.md` | 开发流程文档 |
| `docs/AGENT_DESIGN.md` | Agent设计方案 |
| `docs/需求沉淀.md` | 需求清单 |
| `docs/补充材料-*.md` | 参考资料、数据分析、研究笔记 |
