# Review Follow-up Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复审核意见中属实和部分属实的权限 UX、Vision 隐私风险、tool contract、CDP lifecycle 矩阵和 verifier 证据缺口。

**Architecture:** 采用最小可验证增强：把 permission request 从 broker primitive 提升到 runtime API；把 batch media 工具风险标为 medium 并要求明确任务意图；让 ToolRouter contract 暴露 approvalBehavior；补 CDP same-tab contention 测试；submit verifier 增加 URL/network/form disappearance 证据。所有改动先写 RED 测试，再做最小实现。

**Tech Stack:** TypeScript, WXT, React, Vitest, Playwright E2E, Chrome MV3.

---

### Task 1: Runtime Capability Request API

**Files:**
- Modify: `src/shared/constants/event-names.ts`
- Modify: `src/runtime/runtime-messages.ts`
- Modify: `src/runtime/runtime-port.ts`
- Modify: `src/runtime/extension-runtime-port.ts`
- Modify: `src/runtime/fake-runtime-port.ts`
- Modify: `src/background/runtime/run-manager.ts`
- Modify: `src/background/runtime/background-runtime-host.ts`
- Test: `tests/node/runtime/background-runtime-host.test.ts`
- Test: `tests/node/runtime/extension-runtime-port.test.ts`
- Test: `tests/node/runtime/run-manager.test.ts`

- [x] **Step 1: Add failing tests** proving extension pages can request a capability, content scripts cannot, debugger/downloads return a required-permission reason, and granted optional permissions refresh snapshot capabilities.
- [x] **Step 2: Implement runtime message, port method, RunManager handler, and host routing.**
- [x] **Step 3: Run targeted runtime tests until green.**

### Task 2: Vision Batch Privacy Risk

**Files:**
- Modify: `src/tools/vision/bh-vision-tools.ts`
- Modify: `src/tools/README.md`
- Test: `tests/node/tools/vision/vision-tools.test.ts`

- [x] **Step 1: Add failing tests** proving `bh_vision_batch_capture_full_pages` and `bh_vision_collect_images` are medium risk and reject agent/runtime calls without explicit batch/media task intent.
- [x] **Step 2: Implement per-tool risk override and intent guard for cross-tab/batch media tools.**
- [x] **Step 3: Run vision tool tests until green.**

### Task 3: Tool Contract Approval Behavior

**Files:**
- Modify: `src/tools/core/tool-router.ts`
- Modify: `src/tools/core/tool-prompt-contract.ts`
- Test: `tests/node/tools/core/tool-router.test.ts`
- Test: `tests/node/tools/core/tool-prompt-contract.test.ts`

- [x] **Step 1: Add failing tests** proving approvalBehavior is exposed in tool contracts and included in manifest hash.
- [x] **Step 2: Add approvalBehavior to `ToolPromptContract`, router serialization, and hash input.**
- [x] **Step 3: Run tool contract tests until green.**

### Task 4: CDP Same-tab Contention

**Files:**
- Modify: `tests/node/background/debugger/debugger-manager.test.ts`
- Modify: `src/background/debugger/debugger-manager.ts`

- [x] **Step 1: Add failing test** proving a second attach on the same tab reuses the existing session and refreshes TTL without calling `chrome.debugger.attach` again.
- [x] **Step 2: Implement TTL refresh on already-attached same-tab attach.**
- [x] **Step 3: Run debugger manager tests until green.**

### Task 5: Submit Verifier Evidence Hardening

**Files:**
- Modify: `tests/node/agent/verification/task-verifier.test.ts`
- Modify: `src/agent/verification/submit-verifier.ts`

- [x] **Step 1: Add failing tests** for post-submit URL change, network 2xx evidence, and form disappearance evidence.
- [x] **Step 2: Teach SubmitVerifier to accept those evidence types while preserving error-first behavior.**
- [x] **Step 3: Run verifier tests until green.**

### Task 6: Verification and Notes

**Files:**
- Modify: `implementation-notes.md`

- [x] **Step 1: Run targeted tests for all changed areas.**
- [x] **Step 2: Run `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run build`, `npm run check:release`.**
- [x] **Step 3: Run relevant E2E or explain why E2E was not needed.**
- [x] **Step 4: Update implementation notes and commit if requested.**
