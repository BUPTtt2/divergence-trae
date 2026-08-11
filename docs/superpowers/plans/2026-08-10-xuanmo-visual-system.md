# 玄墨天象视觉系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变真实推演数据流的前提下，完成命牌、推演舞台、演印助手与全站页面的玄墨天象视觉统一，并发布可供复赛验收的公网版本。

**Architecture:** 图像生成只提供无文字材质和氛围背景，真实问题、卦象、路径、行动和来源由 React/Canvas 动态绘制。视觉令牌集中在独立 CSS 文件，推演舞台与工作台使用稳定 Grid，来源标记通过纯函数归一化，避免 UI 直接泄漏 `preset` 或 `fallback` 内部字段。

**Tech Stack:** React 19、React Router、Three.js / React Three Fiber、Framer Motion、Tailwind CSS 3、原生 CSS、Node test runner、Vite 8。

## Global Constraints

- 不改变现有推演 API、Session、智囊、总结、路径选择和命牌保存的数据契约。
- 图像资产不嵌入功能文字；加载失败时必须保留 CSS/Canvas 降级视觉。
- 用户界面不显示 `preset`、`fallback`、内部字段名或英文类别。
- `灵` 仅表示模型生成，`藏` 仅表示离线兜底；不得伪装来源。
- 桌面宽度 1024px 以上无叠压，900px 以下改为上下布局。
- 所有新动效遵守 `prefers-reduced-motion`。

---

### Task 1: 设计令牌与生成图像资产

**Files:**
- Create: `src/theme/xuanmo.css`
- Create: `public/assets/generated/xuanmo/fate-card-surface-v3.png`
- Create: `public/assets/generated/xuanmo/arena-celestial-v3.png`
- Create: `public/assets/generated/xuanmo/page-wash-v3.png`
- Modify: `src/main.jsx`
- Test: `src/theme/xuanmoTokens.test.js`

**Interfaces:**
- Produces: CSS variables `--xm-ink-0`、`--xm-paper`、`--xm-gold`、`--xm-cinnabar`、`--xm-panel`、`--xm-motion-fast`、`--xm-motion-slow`。
- Consumes: Existing `cyberMystic.css` variables remain as compatibility fallback.

- [ ] **Step 1: Write the failing test**

Read `src/theme/xuanmo.css` and assert all required tokens, reduced-motion block, and generated asset URLs exist.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/theme/xuanmoTokens.test.js`  
Expected: FAIL because `xuanmo.css` does not exist.

- [ ] **Step 3: Generate and persist three raster assets**

Use built-in image generation with no text or watermark. Copy results into `public/assets/generated/xuanmo/` with the exact filenames above.

- [ ] **Step 4: Implement tokens and import them**

Create the token file with image-loading fallbacks and import it after `cyberMystic.css` in `src/main.jsx`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test src/theme/xuanmoTokens.test.js`  
Expected: PASS.

### Task 2: 命牌内容模型与来源印记

**Files:**
- Create: `src/game/fateCardPresentation.js`
- Test: `src/game/fateCardPresentation.test.js`
- Modify: `src/components/board/DestinyRevealFX.jsx`
- Modify: `src/game/phases/FateRevealPhase.jsx`
- Modify: `src/components/cards/DecisionCardIdentity.jsx`

**Interfaces:**
- Produces: `buildFateCardPresentation({ fateContent, inference, selectedChoice, question })` returning `{ question, title, summary, actions, sourceMark, sourceLabel }`.
- `sourceMark` is `灵` for model sources and `藏` for actual local/controlled fallback sources.

- [ ] **Step 1: Write the failing test**

Assert real question/path/actions are retained, empty blocks collapse, long text is bounded, model source maps to `灵`, and fallback maps to `藏` without returning the word `预设`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/game/fateCardPresentation.test.js`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the presentation model**

Normalize only display data; do not mutate the underlying inference or fate content.

- [ ] **Step 4: Replace the current card surface and effects**

Use the generated black-jade surface as the Canvas texture base, remove radial signal lines and the persistent center light, retain six-line ignition, weighted flip, short seal impact, and low-frequency idle float.

- [ ] **Step 5: Run focused tests**

Run: `node --test src/game/fateCardPresentation.test.js src/game/decisionCardContract.test.js`  
Expected: PASS.

### Task 3: 稳定舞台与工作台布局

**Files:**
- Modify: `src/pages/Game.jsx`
- Modify: `src/components/board/liveBaguaArena.css`
- Modify: `src/components/sandbox/companionDock.css`
- Modify: `src/components/sandbox/advisorThreadPanel.css`
- Modify: `src/components/sandbox/deliberationConversation.css`
- Test: `src/game/layoutState.test.js`
- Test: `src/components/sandbox/companionLayout.test.js`

**Interfaces:**
- Consumes: existing `sandboxLayoutClass` and `companionDockStyle`.
- Produces: stable class contract where the workbench owns scrolling and the stage remains clipped to its grid cell.

- [ ] **Step 1: Extend failing layout tests**

Assert open assistant uses overlay presentation instead of subtracting 560–960px from stage width, and decision artifact states keep stage/workbench grid boundaries.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test src/game/layoutState.test.js src/components/sandbox/companionLayout.test.js`  
Expected: FAIL on the old width-subtraction behavior.

- [ ] **Step 3: Implement grid and single-scroll ownership**

Replace stage width arithmetic with Grid/overlay rules, set `min-width: 0`, `min-height: 0`, and one explicit scroll owner in each workbench tab.

- [ ] **Step 4: Add bounded entry motion**

Use opacity and transform only; do not animate width, height, top, or left. Disable entry motion under reduced-motion.

- [ ] **Step 5: Run focused tests**

Run: `node --test src/game/layoutState.test.js src/components/sandbox/companionLayout.test.js`  
Expected: PASS.

### Task 4: 将悬浮助手改为“演印”

**Files:**
- Modify: `src/components/sandbox/CompanionDock.jsx`
- Modify: `src/components/sandbox/companionDock.css`
- Modify: `src/components/fx/DraggableCompass.jsx`
- Test: `src/components/sandbox/companionLayout.test.js`

**Interfaces:**
- Closed assistant: 48px launcher with phase title in accessible label.
- Open assistant: maximum 420px overlay side sheet; bottom sheet below 900px.

- [ ] **Step 1: Add failing size and placement assertions**

Assert `companionDockStyle()` clamps desktop width to 420px and mobile layout does not reserve stage width.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test src/components/sandbox/companionLayout.test.js`  
Expected: FAIL because current minimum width is 560px.

- [ ] **Step 3: Implement the assistant shell**

Remove resize arithmetic, retain navigation callbacks, add backdrop/dimming state without changing the stage grid, and preserve keyboard focus styles.

- [ ] **Step 4: Run focused test**

Run: `node --test src/components/sandbox/companionLayout.test.js`  
Expected: PASS.

### Task 5: 全站文案来源与页面外壳统一

**Files:**
- Create: `src/utils/displayProvenance.js`
- Test: `src/utils/displayProvenance.test.js`
- Modify: `src/pages/Agents.jsx`
- Modify: `src/pages/Community.jsx`
- Modify: `src/pages/Landing.jsx`
- Modify: `src/pages/Collection.jsx`
- Modify: `src/pages/Calendar.jsx`
- Modify: `src/pages/Daily.jsx`
- Modify: `src/pages/Dictionary.jsx`
- Modify: `src/components/AppNav.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `displaySourceMark(source, fallback)` and `sanitizeProductCopy(text)`.
- Page roots receive `xm-page` and section surfaces receive `xm-surface` without changing routes.

- [ ] **Step 1: Write the failing provenance test**

Assert internal source values map to `灵`/`藏`, and visible strings replace `预设智囊` with `常驻智囊`, `预设模式` with `本机模式`, while leaving ordinary Chinese text unchanged.

- [ ] **Step 2: Run test to verify failure**

Run: `node --test src/utils/displayProvenance.test.js`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement source and copy normalization**

Keep internal enum values unchanged. Apply normalization only at render boundaries.

- [ ] **Step 4: Apply shared page shell and restrained motion**

Use the generated paper wash, shared typography and surfaces; preserve every existing control, route, callback, and data query.

- [ ] **Step 5: Run focused tests**

Run: `node --test src/utils/displayProvenance.test.js src/pages/calendarModel.test.js`  
Expected: PASS.

### Task 6: Regression, visual acceptance, and public deployment

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Public target: `https://yance-bagua.surge.sh/sandbox?new=3`.

- [ ] **Step 1: Run all frontend Node tests**

Run: `node --test $(rg --files src | rg '\\.test\\.(js|jsx)$')`  
Expected: zero failures.

- [ ] **Step 2: Run lint and production build**

Run: `npm run lint && npm run build`  
Expected: exit 0; no missing imports or CSS parse errors.

- [ ] **Step 3: Verify viewport matrix**

At 1024×768, 1366×768 and 1440×900 inspect `/sandbox?new=3`: no overlap, no horizontal page scroll, readable card, usable assistant, one workbench scroll owner.

- [ ] **Step 4: Verify critical flow**

Exercise start → clarify → case review → advisor selection → deliberation → summary → path → fate reveal. Confirm existing network failures show recoverable inline state and no new uncaught console errors.

- [ ] **Step 5: Deploy and reverify public assets**

Run: `npx surge dist yance-bagua.surge.sh`, then check HTML asset hashes and all referenced JS/CSS return HTTP 200.
