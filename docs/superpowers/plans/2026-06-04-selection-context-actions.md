# Selection Context Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BrowserHelm selection context menu actions for one-click explanation and translation.

**Architecture:** Keep Chrome context menu integration in the background entrypoint, with a focused helper module for menu definitions, task prompt construction, registration, and click handling. Reuse `RunManager.startRun()` and side panel opening so results appear in the existing Cockpit conversation UI.

**Tech Stack:** WXT, Chrome MV3 contextMenus API, TypeScript, Vitest.

---

### Task 1: Context Menu Contract

**Files:**
- Create: `src/background/selection-context-menu.ts`
- Test: `tests/node/background/selection-context-menu.test.ts`
- Modify: `wxt.config.ts`
- Modify: `tests/node/config/manifest-contract.test.ts`

- [x] **Step 1: Write failing tests**

Add tests that assert the manifest declares `contextMenus`, menu registration creates two selection-only items, empty selections are ignored, and explain/translate clicks start `ask` runs with Chinese task text.

- [x] **Step 2: Run tests to verify RED**

Run: `npx vitest run tests/node/background/selection-context-menu.test.ts --reporter=verbose`

Expected: FAIL because `selection-context-menu.ts` does not exist.

- [x] **Step 3: Implement minimal helper**

Create a focused background helper with menu IDs, title definitions, `buildSelectionContextTask()`, `registerSelectionContextMenus()`, and `handleSelectionContextMenuClick()`.

- [x] **Step 4: Wire background entrypoint**

Instantiate the helper from `src/entrypoints/background.ts` using the existing `BackgroundRuntimeHost` and side panel binding/opening path.

- [x] **Step 5: Verify GREEN**

Run the targeted Vitest test and manifest contract after `npm run build`.

### Task 2: Final Verification And Notes

**Files:**
- Modify: `implementation-notes.md`

- [x] **Step 1: Run scoped checks**

Run `npm run typecheck`, `npm run lint -- --max-warnings=0`, and `npm run build`.

- [x] **Step 2: Append implementation notes**

Add a short 2026-06-04 entry describing the context menu architecture, safety boundary, and verification results.
