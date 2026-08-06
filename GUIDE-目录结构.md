# 演策 · 项目目录结构说明

> 本文件说明项目整理后的目录结构与各文件去向，方便后续维护。

## 根目录（保留，构建/运行核心）

| 文件/目录 | 说明 |
|-----------|------|
| `index.html` | Vite 入口 HTML |
| `index.js`   | 根入口 JS |
| `vite.config.js` | Vite 构建配置（base 已设为绝对路径） |
| `postcss.config.js` / `tailwind.config.js` | 样式构建配置 |
| `package.json` / `package-lock.json` | 依赖清单 |
| `vercel.json` / `railway.json` / `render.yaml` | 各平台部署配置 |
| `CNAME` | 域名绑定 |
| `api/` | Vercel Serverless API 入口 |
| `.gitignore` / `.oxlintrc.json` | 工程配置 |
| `README.md` / `CLAUDE.md` | 项目说明 / AI 助手配置 |
| `DEPLOYMENT_GUIDE.md` / `DEPLOYMENT_VERCEL.md` | 部署参考文档 |

## 源码目录（核心，保留）

| 目录 | 说明 |
|------|------|
| `src/` | 前端源码（React + Three.js + Vite） |
| `server/` | 后端 Express 源码 |
| `worker/` | Cloudflare Worker 源码 |
| `functions/` | Vercel Serverless Functions |
| `public/` | 静态资源（favicon、manifest、api-config 等） |

## 文档目录

| 路径 | 说明 |
|------|------|
| `docs/` | **有效文档**：`AGENT_ARCHITECTURE.md`、`AGENT_DESIGN.md`、`05-项目上线文档.md`、`06-Cloudflare-Workers部署.md`、`交付文档.md`，以及 `docs/specs/`（正式规格） |
| `docs/archive/` | **历史归档**：01-34 编号的废弃设计文档、早期规格、过程性文档 |
| `archive/` | **根目录历史归档**：01-08 编号的临时文档（改建模、需求清单、最新任务、部署触发、二维码、DESIGN_DOC、HANDOVER、PROJECT_STATUS） |

## 脚本目录

| 路径 | 说明 |
|------|------|
| `scripts/legacy/` | **一次性修复脚本归档**：01-15 编号（历史上散落在根目录的 py/mjs 修复脚本） |
| `scripts/` | **可复用部署脚本**：20-deploy-backend、21-deploy-cf-workers、22-update-frontend、23-test-insert |

## 已忽略（不提交 Git）

- `node_modules/`：依赖
- `dist/`：本地构建产物
- `surge-dist/`：Surge 部署产物
- `.trae/`：本地 spec
- `server/audit/`：审计日志
- `.env*`：环境变量（含密钥）
- `server/data_store/`：后端数据