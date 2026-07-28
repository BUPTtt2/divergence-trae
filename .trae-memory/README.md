# Trae 跨设备记忆同步目录

> 本目录用于跨设备/跨 Trae 实例同步用户偏好和项目历史记忆。
> Trae 的 memory 文件默认存在 `~/.trae-cn/memory/`，不会随项目 git 同步。
> 把它们复制到项目里，新电脑/新 Trae 克隆项目后即可恢复完整记忆。

## 文件说明

| 文件 | 作用 | 来源 |
|------|------|------|
| `user_profile.md` | 跨项目用户偏好（沟通语言/视觉风格/UI偏好/AI交互方式等） | `~/.trae-cn/memory/user_profile.md` |
| `project_memory.md` | 本项目硬约束/规范/历史决策/技术债/部署配置等 | `~/.trae-cn/memory/projects/<project-id>/project_memory.md` |

## 新 Trae / 新电脑接手时怎么用

### 场景 1：在新电脑克隆项目后恢复记忆

```bash
git clone https://github.com/BUPTtt2/divergence-trae.git
cd divergence-trae

# 把 .trae-memory/ 里的文件复制回 Trae 的 memory 目录
# Windows PowerShell
Copy-Item .trae-memory\user_profile.md "$env:USERPROFILE\.trae-cn\memory\user_profile.md" -Force
# project_memory.md 需要复制到对应项目目录
# 查看项目目录名（通常是项目路径的编码形式）
Get-ChildItem "$env:USERPROFILE\.trae-cn\memory\projects\"
# 找到对应项目目录后复制（目录名因电脑路径不同会变）
# 例如：
# $projDir = "$env:USERPROFILE\.trae-cn\memory\projects\-新电脑路径编码"
# New-Item -ItemType Directory -Force -Path $projDir | Out-Null
# Copy-Item .trae-memory\project_memory.md "$projDir\project_memory.md" -Force
```

### 场景 2：本 Trae 做了重要决策，要同步给其他 Trae

1. 把决策/约束写进 `CLAUDE.md` 或 `docs/AGENT_DESIGN.md`（项目文档，随 git 同步）
2. 同时更新本目录的 `project_memory.md`（Trae 记忆，用于跨 Trae 同步）
3. `git add .trae-memory/ CLAUDE.md docs/AGENT_DESIGN.md && git commit && git push`

### 场景 3：多 Trae 并行开发冲突处理

- **代码冲突**：用 git merge 解决
- **文档冲突**：以 main 分支为权威，feature 分支 rebase
- **记忆冲突**：`.trae-memory/project_memory.md` 以最新提交为准，旧 Trae pull 后覆盖本地

## 重要约定

1. **CLAUDE.md 是产品梳理权威**，AGENT_DESIGN.md 是架构权威
2. **`.trae-memory/` 是 Trae 记忆备份**，不替代项目文档
3. **改了硬约束**：同步更新 `CLAUDE.md` + `docs/AGENT_DESIGN.md` + `.trae-memory/project_memory.md`
4. **新 Trae 接手必读顺序**：
   - 第 1 步：读 `HANDOVER_TO_NEW_TRAE.md`（10 分钟理顺项目）
   - 第 2 步：读 `.trae-memory/user_profile.md`（了解用户偏好）
   - 第 3 步：读 `.trae-memory/project_memory.md`（了解项目历史决策）
   - 第 4 步：把 `.trae-memory/` 文件复制回 Trae memory 目录（恢复记忆）

## 同步状态

- 最后同步：2026-07-27
- 同步来源：`~/.trae-cn/memory/` (Windows 主机)
- 包含内容：user_profile + project_memory (sandbox-app 项目)
