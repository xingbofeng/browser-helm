# v1.6 Review Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按审核意见补齐 v1.6 controlled beta / RC 的 CDP approval、approval behavior、权限生命周期、release gate 和 release note 缺口。

**Architecture:** 先修执行层 P0：所有需要“批准后执行”的工具必须显式注册 side-effect approval flow，并由测试证明 approve/deny/stale/revoked 行为。随后把 approval behavior 写入 ToolSpec 契约与 release hygiene gate，让未来 `requiresApproval` 工具不能静默落到 record-only。P1/P2 的产品边界通过最小实现、文档和可运行 gate 收口，不把 controlled beta 扩大成无条件 production。

**Tech Stack:** TypeScript, WXT, React, Vitest, Playwright E2E, Chrome MV3.

---

### Task 1: CDP Attach Approval Flow

**Files:**
- Modify: `src/background/runtime/run/tools/approval/tool-approval-flow-registry.ts`
- Test: `tests/node/runtime/run/cdp-attach-approval-flow.test.ts`

- [x] **Step 1: Write failing tests** covering approve executes `bh_cdp_attach`, deny does not execute, stale pending action fails closed, and revoked debugger capability blocks execution after approval.
- [x] **Step 2: Run targeted test and confirm RED** with `npx vitest run tests/node/runtime/run/cdp-attach-approval-flow.test.ts --reporter=verbose`.
- [x] **Step 3: Register `TOOL_NAMES.CDP_ATTACH` with `ExecutePendingActionApprovalFlow`** in `ToolApprovalFlowRegistry`.
- [x] **Step 4: Run targeted test and confirm GREEN**.

### Task 2: Explicit Approval Behavior Contract

**Files:**
- Modify: `src/tools/core/tool-spec.ts`
- Modify: tool specs with `requiresApproval: true`
- Modify: `scripts/check-release-hygiene.ts`
- Test: `tests/node/tools/approval-behavior-contract.test.ts`
- Test: `tests/node/scripts/check-release-hygiene.test.ts` if script test coverage exists; otherwise run `npm run check:release-hygiene`.

- [x] **Step 1: Add failing test** requiring every `requiresApproval: true` public tool to declare `approvalBehavior`.
- [x] **Step 2: Add failing release hygiene check** that fails when a `requiresApproval` tool lacks explicit `approvalBehavior`.
- [x] **Step 3: Extend `ToolSpec` with `approvalBehavior: 'record_only' | 'execute_pending_action' | 'custom_flow'`**.
- [x] **Step 4: Annotate existing approval tools** according to actual runtime flow.
- [x] **Step 5: Ensure `execute_pending_action` and `custom_flow` tools are covered by registry/release check allowlist**.

### Task 3: CDP Session Lifecycle

**Files:**
- Modify: `src/background/debugger/debugger-manager.ts`
- Modify: runtime lifecycle/cancel/finish path if needed
- Test: relevant node runtime tests and CDP E2E flow

- [x] **Step 1: Verify current detach behavior on cancel, finish, tab close, external detach, and TTL.**
- [x] **Step 2: Add missing tests for automatic detach and stale session expiry.**
- [x] **Step 3: Implement missing lifecycle cleanup with minimal session owner metadata.**

### Task 4: Permission UX and Downloads Strategy

**Files:**
- Modify: `src/background/runtime/permission-broker.ts`
- Modify: runtime trace/UI files as needed
- Modify: docs/security.md, README/readme release notes
- Test: permission broker/runtime/UI tests

- [x] **Step 1: Prove permission denied/revoked behavior is visible in trace and UI.**
- [x] **Step 2: Add `requestCapability` wrapper only where production path can genuinely request optional permissions.**
- [x] **Step 3: Document that `downloads` is required in controlled beta because background long screenshot export depends on it, and mark production profile caveat.**

### Task 5: Release Hygiene and Verifier Hardening

**Files:**
- Modify: `scripts/check-release-hygiene.ts`
- Modify: verifier files under `src/agent/verification/` if gaps are confirmed
- Modify: release/security docs
- Test: targeted verifier and release hygiene tests

- [x] **Step 1: Replace fragile production gate string checks with importable config/assertions where feasible.**
- [x] **Step 2: Add tests for Submit/Click/Answer verifier edge cases listed in review if current tests do not cover them.**
- [x] **Step 3: Keep Domain Adapter release language explicit: non-executing hints only.**
- [x] **Step 4: Keep real-model/real-site E2E as opt-in evidence and surface this in release notes.**

### Task 6: Verification and Commit

**Files:**
- Modify: `implementation-notes.md`
- Possibly modify: `implementation-notes-archive.md` if main notes exceed maintainable length.

- [x] **Step 1: Run focused Vitest suites for changed runtime/tool/verifier paths.**
- [x] **Step 2: Run `npm run typecheck`, `npm run lint -- --max-warnings=0`, `npm run build`, `npm run check:release`.**
- [x] **Step 3: Run extension E2E for CDP approval path, plus full `npm run test:e2e` if affected areas require it.**
- [x] **Step 4: Review full diff, update implementation notes, then commit on `main` with Chinese Conventional Commit and Codex co-author footer.**
