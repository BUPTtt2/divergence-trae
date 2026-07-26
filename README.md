# 演策 · AI 决策推演沙盘

> 水墨八卦 × 多智囊辩论 × 占卜命签 — 帮你把决策困境交给「演」。
>
> **新接手项目？先读 [HANDOVER_TO_NEW_TRAE.md](HANDOVER_TO_NEW_TRAE.md)**（10 分钟理顺全貌）

---

## 快速开始

```bash
git clone https://github.com/BUPTtt2/divergence-trae.git
cd divergence-trae
npm install
npm run dev    # → http://localhost:5173
```

后端（可选，前端有 localStorage 降级）：
```bash
cd server && npm install && npm run dev    # → http://localhost:3001
```

---

## 文档导航

| 文档 | 作用 | 什么时候读 |
|------|------|-----------|
| **[HANDOVER_TO_NEW_TRAE.md](HANDOVER_TO_NEW_TRAE.md)** | 给新 Trae 的交接文档 | **最先读这个** |
| **[docs/AGENT_DESIGN.md](docs/AGENT_DESIGN.md)** | Agent 架构 + 商业蓝图权威文档 | 改 Agent 行为/prompt 前 |
| **[PROJECT_STATUS.md](PROJECT_STATUS.md)** | 当前功能完成度 + 待办任务 | 了解"现在在哪、要去哪" |
| **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** | 部署完整指南 | 部署前端/后端时 |
| **[CLAUDE.md](CLAUDE.md)** | 产品梳理 + API 对照表 | 查 API 路径/排查问题 |

---

## 技术栈

- **前端**：React 19 + Vite 8 + Three.js（3D 推演台）+ Framer Motion + Tailwind CSS
- **后端**：Express + Railway（`server/` 目录）
- **LLM**：智谱 GLM-4-Flash
- **备用后端**：Hono + Cloudflare Workers（`worker/` 目录，不启用）

---

## 核心流程

```
用户输入问题 → 演析问 → 召唤智囊 → 智囊辩论 → 演总结 → 占卜立卦 → 用户抉择 → 生成命签 → 30天回访
```

## 体验路径（3 分钟）

1. 打开首页 → 接受首访引导
2. 点"立卦开演"→ 输入决策问题（如"要不要接那个新 Offer？"）
3. 看演析问 → 选择智囊 → 看完多智囊辩论
4. 演总结 → 占卜立卦 → 看命牌浮层
5. 抉择 + 本心落笔 → 命签收藏 → 可分享 PNG

---

## 部署

### 前端（Surge）
```bash
npm run build
npx surge dist yance-bagua.surge.sh
```

### 后端（Railway）
```bash
cd server
railway login
railway up
```

详见 [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

---

## 生产地址

| 组件 | 地址 |
|------|------|
| 前端 | https://yance-bagua.surge.sh |
| 后端 | https://yance-bagua-engine-production.up.railway.app |

---

## 项目结构

```
sandbox-app/
├── src/              # 前端（React + Three.js）
│   ├── pages/        # Game(推演台) / Collection(命签) / Agents(智囊阁) / Daily(日签)
│   ├── components/   # board/(3D场景) / agent/ / fate/ / fx/ / layout/
│   ├── services/     # inferenceEngine(核心推理) / apiClient / memoryStore / multiAgentFramework
│   └── data/         # agents(智囊定义) / wisdomHexagrams(卦象库)
├── server/           # 后端（Express + Railway）
│   └── src/
│       ├── routes/   # agent / yan / divination / cards / advisors / daily / followUp
│       └── services/ # agentEngine(LLM编排) / yanChatService / yiJingEngine / memoryService
├── worker/           # 备用后端（Cloudflare Workers，不启用）
└── docs/             # 设计文档和补充材料
```

---

## 关键设计决策

- **Harness 优先于模型**：不换更强 LLM，把编排做厚
- **本地降级永远兜底**：任何 LLM 失败都有模板降级，永不白屏
- **上下文预算控制**：前端拼接 ≤480 字，超限截断，400 降级重试
- **命签即获客载体**：PNG 自带水印，分享即传播
- **30天回访是数据飞轮核心**：没有结局回填就没有准度校准

详见 [docs/AGENT_DESIGN.md](docs/AGENT_DESIGN.md) 的 ADR 决策记录
