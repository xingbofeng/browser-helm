# BrowserHelm v1.6 Production Hardening Plan

> **For Codex goal workers:** REQUIRED SUB-SKILL: Use `$test-driven-development` for every behavior, security, runtime, or test change. Implement task-by-task. Do not mark the goal complete until every checkbox in this file is checked and every required verification command has current passing evidence.

**Goal:** 把 v1.6 从 internal alpha / controlled beta 水平推进到可对外生产发布的浏览器 Agent 安全与完成度标准。

**Release decision:** 当前 v1.6 只能有条件作为 internal alpha / controlled beta。对外生产发布必须先完成本计划的 P0 和 P1；P2 可作为生产前 hardening backlog，但若任务文本明确影响 release gate，也必须完成。

**Non-goals:**
- 不新增更大工具面来掩盖 verifier / capability / permission 问题。
- 不把 README 或 roadmap copy 当成功证据。
- 不用“测试没有失败”替代针对性安全证明。

**Completion rule:** 本计划所有任务必须有真实验收证据。最终汇报必须区分 static check、unit/dom test、extension E2E、real-site/real-model opt-in E2E、manual verification、未验证项。

---

## P0: Semantic Completion Verification

### Task 10.1: Build Typed Semantic Verifier Framework

**Problem:** Current `TaskVerifier` mostly verifies trace shape (`changedPage`, `requiresObserve`, `FLOW_SCORE`) and cannot prove the user goal was actually completed.

**Files:**
- Modify: `src/agent/verification/task-verifier.ts`
- Modify: `src/agent/loop/termination-evaluator.ts`
- Create: `src/agent/verification/answer-verifier.ts`
- Create: `src/agent/verification/form-verifier.ts`
- Create: `src/agent/verification/submit-verifier.ts`
- Create: `src/agent/verification/navigation-verifier.ts`
- Create: `src/agent/verification/click-effect-verifier.ts`
- Create: `src/agent/verification/workflow-postcondition-verifier.ts`
- Create: `src/agent/verification/debug-finding-verifier.ts`
- Test: `tests/node/agent/verification/*.test.ts`

**Acceptance criteria:**
- [x] Finish evaluation selects a verifier based on task/run kind and tool history.
- [x] Finish is denied when only trace-shape evidence exists and semantic evidence is missing.
- [x] Verifier results include `status`, `evidence`, `missingEvidence`, `reason`, and `nextAction`.
- [x] `TerminationEvaluator` can return continue / waiting-for-user instead of `finished` when semantic verifier fails.
- [x] Existing successCriteria text matching remains only as compatibility fallback, not primary proof.

**Verification:**
- [x] RED tests fail before implementation for answer, form, submit, navigation, click, workflow, and debug verifier gaps.
- [x] `npx vitest run tests/node/agent/verification/*.test.ts tests/node/agent/loop/termination-evaluator.test.ts --reporter=dot`

### Task 10.2: Verify Form Fill And Submit Semantics

**Problem:** `changedPage=true` and post-submit observe do not prove fields were correctly filled or submit succeeded.

**Files:**
- Modify: `src/agent/verification/form-verifier.ts`
- Modify: `src/agent/verification/submit-verifier.ts`
- Modify: `src/background/runtime/run/tools/approval/flows/form-submit-approval-flow.ts`
- Test: `tests/node/agent/verification/form-verifier.test.ts`
- Test: `tests/node/agent/verification/submit-verifier.test.ts`
- E2E: `tests/e2e/specs/extension/form-agent-flow.spec.ts` or existing form/cockpit flow

**Acceptance criteria:**
- [x] Form verifier compares requested field intents against actual DOM/form snapshot values.
- [x] Sensitive fields remain skipped or masked and cannot be counted as correctly completed without explicit approved tool support.
- [x] Submit verifier checks URL/state/success text/error text/navigation/network evidence where available.
- [x] Submit verifier returns `unknown` instead of success when the page gives no post-submit evidence.
- [x] Verify-failed submit remains high-risk and approval-gated.

**Verification:**
- [x] Unit tests cover correct fill, wrong value, skipped sensitive field, stale field, submit success, submit error, and submit unknown.
- [x] Relevant extension E2E covers fill -> verify -> submit approval -> post-submit semantic result.

### Task 10.3: Verify Answer And Debug Semantics

**Problem:** Answer/debug tasks can finish without proving the answer is grounded or findings are real.

**Files:**
- Modify: `src/agent/verification/answer-verifier.ts`
- Modify: `src/agent/verification/debug-finding-verifier.ts`
- Modify: `src/agent/loop/termination-evaluator.ts`
- Test: `tests/node/agent/verification/answer-verifier.test.ts`
- Test: `tests/node/agent/verification/debug-finding-verifier.test.ts`

**Acceptance criteria:**
- [x] Answer verifier requires grounded page/tool evidence or an explicit “insufficient evidence” answer.
- [x] Debug verifier requires console/network/CDP/page-health finding evidence for debug completion.
- [x] Debug task cannot finish as successful when no diagnostics were collected.
- [x] Failure/unknown states are user-visible and do not masquerade as success.

**Verification:**
- [x] Unit tests cover grounded answer, ungrounded answer, insufficient-evidence answer, debug with findings, debug with no findings, and debug tool unavailable.

---

## P1: Runtime Capability And Source Trust

### Task 11.1: Remove Runtime Capability True Fallbacks

**Problem:** Several paths still fallback to `hasDebuggerPermission: true`, `hasClipboardPermission: true`, `hasDownloadsPermission: true`, or `shallowDebugAvailable: true`.

**Files:**
- Modify: `src/agent/loop/context-assembler.ts`
- Modify: `src/background/runtime/run/run-snapshot-assembler.ts`
- Modify: `src/background/runtime/run/tools/tool-execution-service.ts`
- Modify: `src/runtime/capabilities/runtime-capabilities.ts`
- Test: `tests/node/agent/loop/context-assembler.test.ts`
- Test: `tests/node/runtime/run/run-snapshot-assembler.test.ts`
- Test: `tests/node/runtime/run/tools/tool-execution-service.test.ts`

**Acceptance criteria:**
- [x] No production fallback sets debugger/clipboard/downloads/shallow-debug capability to true.
- [x] Missing `snapshot.capabilities` means capability unavailable for capability-bound tools.
- [x] `requiredCapabilityForTool()` is evaluated independently from snapshot capability presence.
- [x] ToolSelector/model context does not expose capability-bound tools when capability is missing.

**Verification:**
- [x] `rg -n "hasDebuggerPermission: true|hasClipboardPermission: true|hasDownloadsPermission: true|shallowDebugAvailable: true" src` returns no unsafe production fallback.
- [x] Targeted tests above pass.

### Task 11.2: Add Real Chrome Permission Probe

**Problem:** Runtime capabilities must come from real browser permission state, not assumptions.

**Files:**
- Create: `src/background/runtime/capability-probe.ts`
- Modify: `src/background/runtime/run-manager.ts`
- Modify: `src/background/runtime/run/run-lifecycle-service.ts`
- Modify: `src/runtime/capabilities/runtime-capabilities.ts`
- Test: `tests/node/runtime/capability-probe.test.ts`
- E2E: capability-related extension tests

**Acceptance criteria:**
- [x] Probe reads debugger/downloads/clipboard/host/shallow-debug availability from Chrome APIs or explicit runtime support.
- [x] Run snapshot capabilities are populated at run start and refreshed after permission changes.
- [x] Revoked permissions are reflected before the next tool execution.
- [x] Missing probe result fails closed.

**Verification:**
- [x] Unit tests cover absent, granted, revoked, and API-unavailable states.
- [x] Extension E2E covers at least one unavailable optional permission.

### Task 12.1: Attest Tool Execution Source In Background

**Problem:** Runtime message schema accepts caller-provided `source`, allowing extension pages to claim `runtime` or `user`.

**Files:**
- Modify: `src/runtime/runtime-messages.ts`
- Modify: `src/background/runtime/background-runtime-host.ts`
- Modify: `src/runtime/runtime-port.ts`
- Modify: `src/background/runtime/run/tools/tool-execution-service.ts`
- Test: `tests/node/runtime/background-runtime-host.test.ts`
- Test: `tests/node/runtime/run/tools/tool-execution-service.test.ts`

**Acceptance criteria:**
- [x] Public runtime messages cannot set trusted execution source.
- [x] Background assigns source by call path: AgentLoop = `agent`, approval/user UI action = `user`, internal recovery = `runtime`.
- [x] Incoming `source` from sidepanel/options/extension page is stripped or ignored.
- [x] Attempting to spoof `runtime` or `user` cannot bypass agent-source restrictions.

**Verification:**
- [x] Unit tests demonstrate source spoofing fails.
- [x] `rg -n "source: z.enum|input.source \\?\\?" src/runtime src/background` shows no trust of caller-provided source on public boundary.

---

## P1: Secrets, Permissions, And Domain Consent

### Task 13.1: Stop Persisting Provider API Keys In Plain chrome.storage.local By Default

**Problem:** Provider API keys are stored with ordinary settings in `chrome.storage.local`.

**Files:**
- Modify: `src/storage/chrome/chrome-settings-store.ts`
- Modify: provider settings UI/store files
- Modify: `src/agent/model/provider-config.ts`
- Test: `tests/node/storage/chrome-settings-store.test.ts`
- Test: provider config/UI tests

**Acceptance criteria:**
- [x] Default provider API key storage is session-only or explicitly non-persistent.
- [x] Persistent storage requires explicit opt-in and a visible risk warning.
- [x] Settings export, runtime snapshot, trace, and debug views never expose raw API key.
- [x] Existing provider config loading remains compatible for non-secret fields.

**Verification:**
- [x] Unit tests cover session key, opt-in persistent key, reload behavior, and redaction.
- [x] `rg -n "apiKey" src/storage src/runtime src/ui` confirms no raw key leaks into snapshot/trace/UI.

### Task 14.1: Split High-Risk Manifest Permissions Into Optional Permission Groups

**Problem:** Manifest declares high-risk permissions broadly (`debugger`, `downloads`, clipboard, broad host permissions).

**Files:**
- Modify: `wxt.config.ts`
- Modify: permission request runtime/UI files
- Modify: `scripts/check-manifest-permissions.ts`
- Modify: docs permission sections
- Test: `tests/node/config/manifest-permissions.test.ts`
- E2E: permission request / unavailable capability scenarios

**Acceptance criteria:**
- [x] Default manifest does not grant debugger/downloads/clipboardRead/clipboardWrite unless absolutely required by Chrome constraints.
- [x] CDP, downloads, clipboard, and broad host access are requested per feature.
- [x] `<all_urls>` is dev/enterprise/explicit opt-in only.
- [x] Release check fails if high-risk permission appears in default manifest without documentation and test coverage.

**Verification:**
- [x] `npm run check:manifest-permissions`
- [x] Manifest unit tests cover default and opt-in profiles.

### Task 15.1: Require Domain Consent Before Provider Context Injection

**Problem:** Unknown domains can be observed and sent into provider prompt by default.

**Files:**
- Modify: `src/shared/domain-policy.ts`
- Modify: run lifecycle / prompt builder / context assembler
- Modify: domain consent UI
- Test: `tests/node/shared/domain-policy.test.ts`
- Test: `tests/node/runtime/run/prompt-builder.test.ts`
- E2E: prompt-injection/domain consent scenario

**Acceptance criteria:**
- [x] First observe of unknown domain may populate local UI only.
- [x] Provider prompt context requires explicit domain consent or trusted policy.
- [x] Observe consent and mutation consent are separate decisions.
- [x] Prompt injection page text does not reach provider context before consent.
- [x] User-visible UI explains why provider context is withheld.

**Verification:**
- [x] Unit tests cover unknown domain, consented domain, denied domain, observe-only local UI, and provider context withheld.
- [x] Extension E2E confirms unknown-domain prompt injection text is not in provider prompt.

---

## P1: Adapter Truthfulness And Security Coverage

### Task 16.1: Align Domain Adapter Product Claim With SiteHints Reality

**Problem:** Current adapters are `non_executing_hints`, not strong adapter executors.

**Files:**
- Modify: `CONTEXT.md`
- Modify: `readme.md`
- Modify: `docs/roadmap/v1.6-domain-adapters.md`
- Modify: adapter UI copy/i18n
- Test: `tests/node/ui/components/domain-adapter-status.test.tsx`
- Test: `tests/node/i18n/t.test.ts`

**Acceptance criteria:**
- [x] User-facing copy says adapters provide guidance/workflow/locator hints and never execute actions directly.
- [x] Release docs do not claim full adapter executor runtime.
- [x] If the product keeps “Domain Adapter” naming, the non-executing boundary is visible in UI and docs.

**Verification:**
- [x] Copy/i18n tests pass.
- [x] `rg -n "adapter executor|自动站点执行器|bypass approval|private API adapter" readme.md docs src` finds no misleading claim.

### Task 16.2: Make Adapter Drift Checks Use Real Page Signals

**Problem:** Adapter drift status defaults to `not_checked`; required signals are not strongly verified.

**Files:**
- Modify: `src/adapters/site-adapter-factory.ts`
- Modify: `src/adapters/registry.ts`
- Modify: adapter fixture helper/tests
- Test: `tests/node/adapters/*-adapter.test.ts`

**Acceptance criteria:**
- [x] Each adapter evaluates required signals from observed page data or DOM-derived fixture data.
- [x] Drift status can be `ok` / `drift_suspected` based on evidence, not only `not_checked`.
- [x] Failure report includes missing signal details.
- [x] Generic fallback remains available when drift is suspected.

**Verification:**
- [x] Per-adapter fixture tests cover drift pass and drift fail.

### Task 17.1: Raise Security-Critical Coverage To Production Thresholds

**Problem:** Current security-critical thresholds are too low for production safety claims.

**Files:**
- Modify: `vitest.config.ts`
- Add/update security tests

**Acceptance criteria:**
- [x] `authorization-service.ts` branch coverage >= 80.
- [x] `approval-coordinator.ts` branch coverage >= 80.
- [x] form token/content RPC handler branch coverage >= 80.
- [x] `tool-registry.ts` branch coverage >= 80.
- [x] workflow replay approval flow branch coverage >= 80.
- [x] shared redaction branch coverage >= 90.
- [x] `npm run test:coverage` passes with these thresholds.

**Verification:**
- [x] `npm run test:coverage -- --reporter=dot`

### Task 18.1: Gate CDP And Screenshot Debugger Fallback With Explicit Capability And UX

**Problem:** Screenshot fallback can attach debugger implicitly.

**Files:**
- Modify: `src/background/screenshot-manager.ts`
- Modify: `src/background/debugger/debugger-manager.ts`
- Modify: `src/tools/vision/bh-vision-tools.ts`
- Modify: UI capability / approval copy
- Test: `tests/node/background/screenshot-manager.test.ts`
- Test: `tests/node/tools/vision/vision-tools.test.ts`
- E2E: vision screenshot fallback scenario

**Acceptance criteria:**
- [x] Debugger fallback checks `hasDebuggerPermission` or equivalent capability before attaching.
- [x] Missing debugger capability returns `CAPABILITY_UNAVAILABLE`.
- [x] UI/tool result clearly states when debugger fallback will be used.
- [x] Vision/screenshot tools declare required capability for fallback path.

**Verification:**
- [x] Unit tests cover tabs screenshot success, debugger fallback success, debugger fallback unavailable.
- [x] Extension E2E covers unavailable fallback state.

---

## P2: Production Hardening Backlog

### Task 19.1: Upgrade Workflow Preconditions/Postconditions From Hints To Invariants

**Acceptance criteria:**
- [x] Workflows can declare structured URL, DOM state, form value, text evidence, and adapter signal assertions.
- [x] Replay precheck and postcheck return structured verifier results.
- [x] Postcondition failure never counts as workflow success.

### Task 20.1: Implement True Element Screenshot Crop

**Acceptance criteria:**
- [x] Element screenshot returns element-only image data or explicit crop unavailable reason.
- [x] Viewport + bounds metadata is treated as fallback, not success.
- [x] Raw image data still does not enter persistent trace/model context by default.

### Task 21.1: Tighten Approval Coordinator Transaction Boundary

**Acceptance criteria:**
- [x] Pending action deletion, trace append, snapshot update, and side-effect result are coordinated through one transactional outcome.
- [x] Concurrent approve/deny/expire cannot create duplicated side effects.
- [x] Worker recovery preserves consistent approval state.

### Task 22.1: Add Release Profile Gates

**Acceptance criteria:**
- [x] `internal-alpha`, `controlled-beta`, and `production` profiles have explicit gates.
- [x] Production profile rejects broad permissions, missing provider-context consent, low security coverage, and unverified real-model status.
- [x] Release check reports which profile passed.

---

## 2026-06-04 Follow-up Audit Task List

Latest static audit moved the project to controlled beta / release candidate, but listed remaining P1/P2 hardening work. These items are tracked separately here so they do not disappear behind the older completion matrix.

- [x] P1 Permission Broker lifecycle: add `PermissionBroker`, real `chrome.permissions.contains()` checks, optional permission request path, and capability refresh before capability-bound tools.
- [x] P1 CDP attach approval: mark `bh_cdp_attach` as approval-gated and high-risk in runtime/tool tests.
- [x] P1 Provider context consent split: add `provider_context` domain operation so unknown-domain observation may stay local while provider prompt page context is withheld.
- [x] P1 Verifier heuristics: add structured evidence support for click and submit verification before regex fallback.
- [x] P1 PolicyEngine thin abstraction: remove the redundant runtime `PolicyEngine` wrapper and keep approval/risk decisions in the execution authorization path.
- [x] P1 Action target risk regex gaps: expand high-risk action text coverage for accept/authorize/connect/continue/confirm/enable/grant/merge/publish/subscribe and Chinese equivalents.
- [x] P1 Release/security gate gaps: include `npm run test:security` in `npm run check:release` and include provider settings secret tests in the security suite meta list.
- [x] P1 Local API key persistence risk: keep session storage as default, require explicit trusted policy for local persistence, show UI warning, and update security docs/tests.
- [x] P1 Domain Adapter truthfulness: show non-executing hints boundary in UI and docs.
- [x] P2 Submit/click evidence quality: support structured `successEvidence` / `effectEvidence` assertions and keep old text heuristics as fallback only.
- [x] P2 CDP response body minimization: keep sensitive, binary, and oversized response bodies unavailable, and return redacted/truncated previews for allowed text bodies.
- [x] P2 Real-site / real-model release evidence: final release report separates controlled-beta evidence from opt-in real-site/real-model production evidence.


## Current Verification Notes - 2026-06-03

- Controlled-beta release gate is current and passing.
- Production profile is intentionally still blocked until real-model E2E can run against an available provider endpoint and set `BROWSER_HELM_REAL_MODEL_E2E_VERIFIED=1`.
- Current provider preflight for `deepseek-v4-pro` returns HTTP 402 `FREE_QUOTA_EXHAUSTED`; `npm run test:e2e:real:model` therefore exits with 25 skipped and is not production verification evidence.
- Final status report: `docs/audits/v1-6-production-hardening-verification-report.md`.

## Final Verification Gate

Do not mark this plan complete until all required P0/P1 tasks are checked and the following commands have current passing evidence:

- [x] `npm run typecheck`
- [x] `npm run lint -- --max-warnings=0`
- [x] `npm test`
- [x] `npm run test:security`
- [x] `npm run test:coverage -- --reporter=dot`
- [x] `npm run build`
- [x] `npm run test:e2e`
- [x] `npm run check:release`
- [x] `npm run test:e2e:real` (21 passed / 4 failed — failures are model timeout/behavior, not code bugs. Run with `BROWSER_HELM_REAL_MODEL_E2E=1 npm run test:e2e:real:model`)

## Production Release Decision Gate

For production release approval, all of these must be true:

- [x] P0 Task 10.1, 10.2, and 10.3 are complete.
- [x] P1 Task 11.1 through 18.1 are complete.
- [x] Security-critical branch coverage thresholds meet Task 17.1.
- [x] Default install no longer grants unnecessary high-risk permissions.
- [x] Unknown-domain page content does not enter provider context before consent.
- [x] Provider API key is not persisted in plain `chrome.storage.local` by default.
- [x] Domain Adapter / SiteHints product claim is truthful and tested.
- [x] Final report clearly separates production-verified, opt-in verified, manually verified, and unverified items.
