content = """# 安全审查报告

**日期**: 2026-07-13  
**版本**: v1.0  
**审查范围**: sandbox-app 前端项目

---

## 问题清单

### 问题1: [严重] JSON.parse 无 try-catch 保护 - 多处存在

**入口**: 多个文件  
**模块**: localStorage 数据读取  
**行为**: 当 localStorage 数据被污染时，JSON.parse 会抛出异常导致页面崩溃  
**影响**: 整个页面白屏

**具体位置**:
- useAchievements.js:140, 168, 188
- Daily.jsx:130
- DailyTasks.jsx:70, 133, 331

**修复**: 在所有 JSON.parse 外层添加 try-catch 包裹

---

### 问题2: [严重] JSX 中直接 JSON.parse - 未保护

**入口**: DraggableCompass.jsx:870  
**行为**: 在 JSX 渲染过程中直接调用 JSON.parse，无任何异常保护  
**影响**: 数据污染时整个组件渲染失败

**修复**: 将 JSON.parse 移到 useEffect 中

---

### 问题3: [中等] XSS 风险 - localStorage 内容直接渲染

**入口**: DraggableCompass.jsx:870, NoteModal.jsx  
**行为**: localStorage 中存储的用户输入内容直接渲染到 DOM 中  
**影响**: 恶意扩展可能写入 HTML 片段

**修复**: 添加输入过滤函数

---

### 问题4: [中等] 敏感词列表不够全面

**入口**: customAgent.js  
**行为**: 敏感词列表仅包含基础词汇  
**影响**: 用户可能创建包含不当内容的 Agent

**修复**: 扩展敏感词列表

---

### 问题5: [中等] API 超时处理不完善

**入口**: apiClient.js  
**行为**: request 函数没有超时控制  
**修复**: 添加默认超时（10秒）

---

### 问题6: [低] localStorage 存储容量未检查

**入口**: 所有 localStorage.setItem 调用  
**行为**: 超出容量时写入失败无反馈  
**修复**: 添加容量检查和用户提示

---

### 问题7: [低] 用户 ID 可被伪造

**入口**: apiClient.js:getUserId  
**行为**: 用户 ID 存储在 localStorage，可被手动修改  
**修复**: 后端验证用户 ID 合法性

---

### 问题8: [低] YanChat 对话历史无大小限制

**入口**: YanChat.jsx  
**行为**: 对话历史无条目数量限制  
**修复**: 添加历史记录数量限制（如最多 50 条）

---

## 风险优先级汇总

| 优先级 | 问题 | 状态 |
|--------|------|------|
| 严重 | JSON.parse 无 try-catch 保护 | 需立即修复 |
| 严重 | JSX 中直接 JSON.parse | 需立即修复 |
| 中等 | XSS 风险 | 建议修复 |
| 中等 | 敏感词列表不够全面 | 建议修复 |
| 中等 | API 超时处理不完善 | 建议修复 |
| 低 | localStorage 容量未检查 | 可后续优化 |
| 低 | 用户 ID 可被伪造 | 依赖后端 |
| 低 | YanChat 对话历史无大小限制 | 可后续优化 |

---

## 已确认的安全措施

- 输入长度校验 ✅
- 敏感词过滤 ✅
- 特殊字符过滤 ✅
- SSE 超时检测 ✅
- 类型检查 ✅
- ErrorBoundary ✅

---

## 修复建议

### 最小必要修改（今天必须修）
1. 为所有 JSON.parse 添加 try-catch
2. 修复 DraggableCompass.jsx:870 的 JSX 内解析
3. 为 request 函数添加默认超时

### 后续优化
1. 扩展敏感词列表
2. 添加 localStorage 容量检查
3. 为 YanChat 对话历史添加限制
"""

with open('docs/04-安全审查.md', 'w', encoding='utf-8') as f:
    f.write(content)

print('Security audit document written successfully')
