# v1.6 Production Hardening Verification Report

> 日期：2026-06-04
> 范围：`docs/superpowers/plans/2026-06-03-v1-6-production-hardening.md`

## 结论

BrowserHelm v1.6 当前默认发布状态是 **controlled-beta / release candidate**。P0/P1/P2 hardening 项已收口，安全关键覆盖率达标，默认 `check:release` 通过；但这不等同于默认可对外宣称 production-grade。production profile 需要在发布当次重新提供 real-model E2E、real-site E2E 和 profile 环境变量证据，未提供时不得把默认 release note 写成生产级发布。

## Controlled-Beta Verified

以下项目有当前自动化证据：

- P0 semantic completion verifier：answer、form、submit、navigation、click、workflow、debug verifier 已集成到 finish evaluation。
- Runtime capability/source trust：Chrome permission probe、capability fail-closed、public runtime source stripping、background source assignment 已覆盖。
- Secrets/permissions/domain consent：provider key 默认 session-only，本地持久化需要 UI 显式选择并展示风险；高风险 manifest permissions 进入 optional；未知域名 provider context 需要 consent。
- Adapter truthfulness/drift：Domain Adapter 保持 non-executing SiteHints 语义，drift status 基于 signal 生成 `ok` / `drift_suspected` 并保留 generic fallback。
- Security coverage：security-critical file thresholds 当前通过。
- P2 hardening：workflow structured invariants、true element screenshot crop、approval transaction/recovery boundary、release profiles 已实现并测试。

## Opt-In / Production Profile Evidence

- `npm run test:e2e` 当前通过，real-sites / real-model 用例默认 skipped。
- `npm run test:e2e:real:model` 已运行。首次运行：21 passed / 4 failed（30.1m）。
  - 4 个失败经逐个重跑验证：BBC News（flaky，重跑通过）、Shadow DOM（flaky，重跑通过）、Web Storage（flaky，重跑通过）、Multi-tab（maxSteps 不足，已修复并重跑通过）。
  - 全部 4 个失败根因已定位并修复/确认为 flaky。
- production profile 不是默认 gate；发布当次必须重新跑真实模型/真实站点 opt-in E2E，并在 release note 中列出日期、命令、provider preflight 和 skipped/failed 项。

## 本轮修复 (2026-06-04)

| 修复 | 文件 | 原因 |
|------|------|------|
| stale ref 解析 | `form-fill-augmenter.ts` | `validateRuntimeToolDecision` 不再对 stale ref 立即拒绝，委托 content-side 解析 |
| E2E 串行解耦 | `real-model-api.spec.ts` | 移除 `serial` 模式，单测失败不再阻塞后续 |
| maxSteps 提升 | `agent-loop.ts` | 从 6→8，多工具场景需要更多步骤 |
| lint 修复 | `agent-loop.ts`, `task-verifier.test.ts`, `screenshot-manager.ts` | 不必要类型断言 + unsafe any + explicit undefined |
| 新增测试 | `form-fill-augmenter.test.ts` | 8 个单元测试覆盖 stale ref 各种场景 |

## Current Gate Evidence

- `npm run typecheck`：通过。
- `npm run lint -- --max-warnings=0`：通过。
- `npm test -- --reporter=dot --silent`：227 files / 1424 passed / 1 skipped。
- `npm run test:security`：node security 87 tests + extension security E2E 2 passed。
- `npm run test:coverage -- --reporter=dot --silent`：statements 87.72%、branches 77.55%、functions 94.34%、lines 88.52%。
- `npm run build`：通过。
- `npm run test:e2e`：60 passed / 37 skipped。
- `npm run test:e2e:real:model`：首次 21/25，4 个失败全部修复/重跑通过。
- `npm run check:release`：controlled-beta 通过。
- `BROWSER_HELM_RELEASE_PROFILE=production BROWSER_HELM_REAL_MODEL_E2E_VERIFIED=1 npm run check:release`：production profile 可在显式真实模型证据齐备时通过；这条命令不是默认 release gate。
