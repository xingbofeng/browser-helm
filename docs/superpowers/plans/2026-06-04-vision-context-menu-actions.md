# Vision Context Menu Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BrowserHelm right-click actions for viewport screenshot, current-page long screenshot, and current-page image collection.

**Architecture:** Extend the existing background context menu helper so all BrowserHelm right-click actions live under one parent menu. Reuse `RunManager.startRun()`, `RunManager.executeTool()`, and the existing side panel run opening path instead of creating a new screenshot pipeline.

**Tech Stack:** WXT, Chrome MV3 contextMenus API, TypeScript, Vitest.

---

### Task 1: Grouped Context Menu Contract

**Files:**
- Modify: `src/background/selection-context-menu.ts`
- Modify: `tests/node/background/selection-context-menu.test.ts`

- [x] **Step 1: Write RED tests**

Add tests that expect a `BrowserHelm` parent menu plus five child menu items: explain, translate, capture viewport, capture long page, collect images.

- [x] **Step 2: Verify RED**

Run: `npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=verbose`

Expected: FAIL because only explain/translate child registration exists.

- [x] **Step 3: Implement registration**

Update menu IDs, menu definitions, contexts, parentId, and registration loop.

- [x] **Step 4: Verify GREEN**

Run: `npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=dot`

Expected: PASS.

### Task 2: Vision Click Execution

**Files:**
- Modify: `src/background/selection-context-menu.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `tests/node/background/selection-context-menu.test.ts`

- [x] **Step 1: Write RED tests**

Add tests that each Vision menu action starts a `debug` + `observe_only` run, executes the mapped Vision tool with empty args, and opens side panel for the run.

- [x] **Step 2: Verify RED**

Run: `npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=verbose`

Expected: FAIL because Vision menu IDs are ignored.

- [x] **Step 3: Implement click handling**

Extend helper deps with `executeTool`, map Vision action to `TOOL_NAMES`, and pass `executeTool` from `RunManager` in background.

- [x] **Step 4: Verify GREEN**

Run: `npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=dot`

Expected: PASS.

### Task 3: Verification And Notes

**Files:**
- Modify: `implementation-notes.md`

- [x] **Step 1: Run verification**

Run: `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run build`, and targeted tests.

- [x] **Step 2: Append notes**

Record architecture, safety boundary, and exact verification results in `implementation-notes.md`.
