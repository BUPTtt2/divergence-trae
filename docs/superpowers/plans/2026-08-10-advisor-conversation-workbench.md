# Advisor Conversation Workbench Implementation Plan

> **For agentic workers:** Execute inline in the documented runtime copy. Do not create another worktree and do not run the test suite because the user explicitly requested no tests.

**Goal:** Turn the sandbox into a continuous case-to-council conversation workspace with isolated advisor/group memory, usable catalog actions, non-blocking records, and the restored original process rail.

**Architecture:** Keep authoritative deliberation state on the existing backend and add a session-scoped conversation projection on the frontend. Every conversation thread owns its member snapshot and messages; an advisor's one-to-one thread does not inherit other advisors' private content, while a group thread retains only messages that advisor actually participated in. Reuse the existing targeted `QUESTION` command for real advisor calls and keep case updates on the existing `SUPPLEMENT`/`CORRECTION` path.

**Tech Stack:** React, Vite, native CSS, existing deliberation REST/SSE APIs, Express service layer.

## Global Constraints

- Preserve the previous seven-node top process bar visual language.
- Remove the synthetic case-completeness percentage.
- Never merge message histories by display name; use session, thread, advisor, and event identity.
- Search and subscription controls must call existing real APIs.
- Do not run tests; only run the production build requested for deployment.
- Sync to the production candidate and deploy only after the implementation is complete.

---

### Task 1: Restore process rail and remove synthetic readiness

**Files:**
- Modify: `src/components/board/ProcessStepper.jsx`
- Modify: `src/components/board/processStepper.css`
- Modify: `src/components/sandbox/CouncilWorkbench.jsx`
- Modify: `src/components/sandbox/councilWorkbench.css`

- [ ] Restore the prior seven-node process rail and map `clarify_loop`, `case_file_confirm`, and `agent_select` without changing its visual style.
- [ ] Delete the percentage calculation and render only explicit case facts, blocking unknowns, retained conditions, and selected perspectives.

### Task 2: Progressive clarification and stable event identity

**Files:**
- Modify: `server/src/services/deliberationEngine.js`
- Modify: `src/game/useDeliberationFlow.js`

- [ ] Require a second semantic intake pass unless the user explicitly chooses to continue with current information.
- [ ] Preserve the existing maximum-round safety boundary.
- [ ] Deduplicate thought, observation, and advisor messages by stable event ID or normalized content fingerprint.
- [ ] Ensure selecting a history filter never appends a message.

### Task 3: Real catalog search, subscription, and avatars

**Files:**
- Modify: `src/components/sandbox/CouncilWorkbench.jsx`
- Modify: `src/components/sandbox/councilWorkbench.css`
- Modify: `src/game/useDeliberationFlow.js`
- Modify: `src/components/AgentCreator.jsx`
- Modify: `src/services/advisorClient.js`

- [ ] Add search and source/state filtering to the council catalog.
- [ ] Wire subscribe and unsubscribe to the existing advisor API and refresh the catalog after success.
- [ ] Render a consistent avatar derived from advisor data and add avatar selection to the forge flow.

### Task 4: Isolated one-to-one and group advisor threads

**Files:**
- Create: `src/game/advisorThreads.js`
- Create: `src/components/sandbox/AdvisorThreadPanel.jsx`
- Create: `src/components/sandbox/advisorThreadPanel.css`
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/game/useDeliberationFlow.js`
- Modify: `src/pages/Game.jsx`

- [ ] Model threads as `{id, sessionId, kind, memberIds, messages, updatedAt}` and record a member snapshot per user message.
- [ ] Open a private thread from the active advisor without importing other advisors' content.
- [ ] Parse `@advisor` mentions, allow members to be added or removed before sending, and send the targeted question only to that snapshot.
- [ ] Store resulting advisor messages only in threads whose member snapshots include that advisor.
- [ ] Keep thread state scoped to the active deliberation session.

### Task 5: Unify judgment, record, and case actions

**Files:**
- Modify: `src/components/sandbox/DeliberationConversation.jsx`
- Modify: `src/components/sandbox/deliberationConversation.css`
- Modify: `src/components/sandbox/CompanionDock.jsx`
- Modify: `src/components/sandbox/companionDock.css`

- [ ] Auto-focus the running or latest advisor and show a visible speaking cue.
- [ ] Replace the duplicated focused-card plus full list with one continuous advisor workspace.
- [ ] Put record filters, transcript, thread composer, and case-update action in the same scroll hierarchy.
- [ ] Keep the header compact and the composer sticky so `本轮判断已到齐` cannot cover content.
- [ ] Rename supplement to `更新案卷`, explain affected judgments, and preserve correction/pause controls.

### Task 6: Global floating command center

**Files:**
- Modify: `src/components/fx/DraggableCompass.jsx`

- [ ] Replace novelty-first items with real navigation for active session, new session, records, advisors, collection, profile, and session memory.
- [ ] Keep casting and note-taking as secondary tools.
- [ ] Label local-only profile/preferences honestly and do not expose nonexistent settings routes.

### Task 7: Build, sync, and deploy

**Files:**
- Sync changed runtime files to `/Users/yegua/vibe/个人Trae赛/演策-复赛生产候选版`

- [ ] Run the frontend production build only.
- [ ] Run the backend production build command only if the project defines one.
- [ ] Synchronize the production candidate without deleting unrelated user files.
- [ ] Deploy the current candidate to the existing Surge site and report the link.
