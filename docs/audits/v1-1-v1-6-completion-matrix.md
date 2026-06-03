# v1.1-v1.6 完成度矩阵

> 生成日期：2026-06-02
> 状态枚举：`done`、`partial`、`missing`、`blocked-by-security`、`deferred-by-scope`

## Release Gate

P0_GATE: closed

当前结论：**v1.6 可作为 release candidate 进入发布流程**。P0 安全阻断已收口，v1.1-v1.6 roadmap AC 均已完成，最终 release verification 已通过；real-model/真实站点 E2E 仍保持 opt-in，未配置凭据或环境变量时不作为默认 release gate。

不计为完成的证据：
- 仅新增 `TOOL_NAMES`、空目录、`.gitkeep` 或 manifest entry。
- 仅有 prompt guidance、roadmap 文案或静态 UI shell。
- 仅有单个 happy path 单测，但缺少 approval、stale、redaction、fallback 或 E2E 覆盖。
- 仅能手动演示，缺少可重复的自动化或明确的人工验收记录。

## v1.1 Assisted Form Fill + Frontend Debug

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 console / network 错误收集并解释 | done | `bh_debug_collect_page_health`、page-health reader、nonce-gated hook、默认不注入、URL/secret redaction、Page Inspector 诊断和 console/network UI state 已由 node/dom/tool/E2E 覆盖。 | Task 9.3 final regression |
| AC2 submit 前 verify_form 和 approval 字段摘要 | done | form submit approval payload 已包含 form/action/method/target/字段类型/跳过字段/verify/masked values；批准后 re-read/reverify/digest stale 测试已覆盖。 | Task 9.3 final regression |
| AC3 FormPanel 展示字段/required/disabled/validation | done | 表单读取、元素与表单调试标签、required/validation/disabled 状态和窄 side panel 布局已有组件与 cockpit E2E 覆盖。 | Task 9.3 final regression |
| AC4 disabled submit reason | done | disabled submit 工具、诊断报告、状态 signal 和 Cockpit/Form Doctor E2E 已覆盖。 | Task 9.3 final regression |
| AC5 无表单/无错误空状态 | done | no form、valid form、invalid form、disabled submit、console/network empty/issue state 已在组件测试和 debug/page-health E2E 中覆盖。 | Task 9.3 final regression |
| AC6 v0.x 行为不受影响 | done | 最终 `npm test`、`npm run test:coverage`、`npm run build`、`npm run test:e2e` 和 `npm run check:release` 已通过；v0.x 相关页面观察、ref、sidepanel、runtime 回归未失败。 | Task 9.3 done |
| AC7 改动范围偏离说明 | done | implementation notes 已记录各阶段偏差、权衡和未验证项；最终 notes 记录 real-model opt-in 未运行。 | Task 9.3 done |
| AC8 设计图/视觉范围验收 | done | 窄宽度 side panel 截图、native side panel path/binding、Cockpit UI 和 form/debug 状态均由 extension E2E 覆盖；系统原生宿主 resize/关闭属于人工发布验收，不阻塞默认 release gate。 | Task 9.3 done |

## v1.2 Memory + Workflow Replay

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 domain memory hit 并允许确认复用 | done | memory lookup/injection 已要求 domain scope，domain policy denied 时不注入 hits；MemoryViewer、memory repo/tool、workflow replay preview 和 final regression 均通过。 | Task 9.3 done |
| AC2 replay preview 且要求确认 | done | workflow 保存/预览已记录 domain、origin、URL pattern、页面标题/文本 hints、key refs、tool manifest hash、adapter id/version 和 completion evidence；preview 会展示 unmet preconditions；approval flow 在页面证据不匹配时首步前 fail closed，并在 replay 后按 completion evidence 计分。 | Task 9.3 final regression |
| AC3 查看/删除 domain memory | done | MemoryViewer 覆盖按 entry 删除、按 domain 清空和 clear all 控制；side panel 通过 `bh_memory_delete`、`bh_memory_clear_domain`、`bh_memory_clear_all` 接入本地 memory repo。 | Task 9.3 final regression |
| AC4 scratchpad 跨 turn 摘要 | done | pad tools、AgentLoop prompt context 和 final full unit/coverage regression 已通过，跨 turn context 注入未出现回归。 | Task 9.3 done |
| AC5 trace/tool/observation/workflow 生成 SessionSummary | done | summary builders、trace replay seed、workflow draft/replay 和 redaction tests 已覆盖；final full unit/coverage regression 通过。 | Task 9.3 done |
| AC6 trace replay reader 字段完整性 | done | `buildTraceReplaySeed` 输出 sanitized raw model output、parse repair、parsed decision、tool args preview、tool result summary、timestamps、error codes 和 tool manifest hash；测试覆盖 provider key、raw screenshot data、clipboard text、sensitive form values 不落 seed。 | Task 9.3 final regression |
| AC7 成功 plan 生成 workflow draft 而非静默可执行 | done | plan-to-workflow draft 保持 unsaved preview/approval 语义；workflow replay 现在要求前置条件匹配和后置证据成功后才计 success，不能静默执行为成功。 | Task 9.3 final regression |
| AC8 不新增 sub-agent 决策类型 | done | 当前计划明确保持单 AgentLoop；代码路径未引入 sub-agent decision。 | Task 9.3 final regression |
| AC9 memory 默认不保存敏感信息 | done | MemoryRepo/WorkflowRepo 测试覆盖 task、summary、tags、workflow args/argsPreview 中的 password、token、OTP、payment、provider key、clipboard text 和字段值不落 raw 值。 | Task 9.3 final regression |
| AC10 v1.0/v1.1 行为不受影响 | done | `npm test`、coverage、build、extension E2E 和 release check 全部通过；v1.0/v1.1 UI/form/debug 路径未回归。 | Task 9.3 done |
| AC11 改动范围偏离说明 | done | notes 已记录阶段偏差和最终 real-model opt-in 未验证项。 | Task 9.3 done |
| AC12 设计图/视觉范围验收 | done | roadmap 视觉边界由 Cockpit/Form/Debug/Memory/Adapter/Vision 组件测试与 extension E2E 覆盖；默认 release gate 不要求额外 Figma/人工截图。 | Task 9.3 done |

## v1.3 DevTools/CDP

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 request detail/status/headers/body | done | CDP tools、debugger manager、network store/redaction tests 已覆盖 request detail、status、headers、initiator/timing、bounded body availability 和 unavailable reason。 | - |
| AC2 debugger attach 失败 UI | done | CDP UI 测试已覆盖 detached、attaching、attached、attach failed、no requests、request selected、response unavailable 和 externally detached；CDP E2E 主路径通过。 | - |
| AC3 PerformancePanel metrics | done | Performance tool 返回 bounded summary，PerformancePanel 和 CDP E2E 已覆盖 metrics 可见性。 | - |
| AC4 headers/cookies 默认 mask | done | CDP tool/UI 测试与 E2E 已覆盖 sensitive header/body mask，trace/tool data 不暴露 raw secret。 | - |
| AC5 shallow debug 不受影响 | done | page-health nonce/default-off/redaction 已有 node/dom/tool/E2E 覆盖，最终 full unit/coverage/E2E/release check 通过。 | Task 9.3 done |
| AC6 改动范围偏离说明 | done | notes 已记录 CDP 与 shallow debug 边界。 | Task 9.3 done |
| AC7 设计图/视觉范围验收 | done | CDP UI 产品状态、debug drawer、Page Inspector 和 page-health opt-in 均有组件/E2E 覆盖。 | Task 9.3 done |

## v1.4 Vision/Screenshot

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 overlay / layout issue 视觉解释 | done | screenshot lifecycle、claim grounding、vision tools、overlay fixture、VisionPanel enhanced evidence、AgentLoop bounded vision evidence 和 vision E2E 已覆盖。 | Task 9.3 final regression |
| AC2 vision 不可用回退 DOM/a11y | done | vision unavailable fallback、fallback UI、screenshot failure state、model context 只在显式 vision tool 后注入 bounded summary 的测试已覆盖。 | Task 9.3 final regression |
| AC3 Vision summary 与 DOM observation 同入 trace | done | screenshot raw image 已禁止进入持久 snapshot/trace；prompt 只注入脱敏、限长的 `visionEvidence`，默认 DOM observation 不会伪装成 vision context。 | Task 9.3 final regression |
| AC4 坐标点击非首选且敏感场景 approval | done | `bh_pointer_click` 现在要求高置信 visionGrounding 与 DOM/a11y ref unavailable 证据，敏感坐标仍 approval required；单测和 vision E2E 已覆盖。 | - |
| AC5 DOM/a11y-first 不受影响 | done | tool selector、vision mode、vision fallback、pointer grounding 和 extension vision E2E 均通过；最终 full regression 未回归 DOM/a11y-first。 | Task 9.3 done |
| AC6 改动范围偏离说明 | done | notes 已记录 vision 不作为默认 observation、raw screenshot 不入持久 trace/context。 | Task 9.3 done |
| AC7 设计图边界验收 | done | VisionPanel、enhanced evidence、screenshot failure/fallback 和 extension vision E2E 均通过。 | Task 9.3 done |

## v1.5 Advanced Browser Tools

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 跨 tab / iframe 上下文与正确目标读写 | done | tab URL path/query/hash 脱敏、frame tree/origin/cross-origin limitation、shadow open root bounded summary 均有 node 覆盖；advanced tab/shadow extension E2E 已通过。 | Task 9.3 final regression |
| AC2 上传/剪贴板/文件敏感动作 approval trace | done | file/download/doc 边界已覆盖；clipboard/storage 工具调用只创建 approval，执行层 approval preview 使用脱敏 `argsPreview`，批准后才读写剪贴板或 mutating Web Storage；deny、缺失/过期 pending action 均不触发状态变更；advanced clipboard/storage E2E 已通过。 | Task 9.3 final regression |
| AC3 PDF/doc tools 文本/页码/scanned/truncated | done | doc/file managers 返回 source URL metadata、page range、page count、scanned、truncated、filtered PDF unavailable reason 和 parser limitation；advanced doc E2E 已通过。 | Task 9.3 final regression |
| AC4 高级工具不可用限制和 fallback | done | tab/frame/shadow、download/file/doc 工具均返回明确 limitation/fallback 或 bounded metadata；file/doc E2E 与 node tests 已通过。 | Task 9.3 final regression |
| AC5 v1.1/v1.3/v1.4 不受影响 | done | advanced tools、form/debug/CDP/vision 相关 node、coverage 和 extension E2E 全部通过。 | Task 9.3 done |
| AC6 改动范围偏离说明 | done | notes 已记录复杂 PDF parser 未引入、file/download/doc 限制和审批边界。 | Task 9.3 done |
| AC7 设计图边界验收 | done | advanced tab/shadow/file/doc/clipboard/storage E2E 和相关 UI/manager tests 已覆盖。 | Task 9.3 done |

## v1.6 Domain Adapters

| AC | 状态 | 当前证据 | 后续任务 |
| --- | --- | --- | --- |
| AC1 检测站点并加载 guidance/workflow | done | adapter registry、site factory、8 个 adapter skeleton、adapter tools、DomainAdapter 非执行型范围、version/lastVerifiedAt/supportedUrlPatterns/requiredSignals/driftChecks、detect drift status 和 generic fallback reason 均有 node 覆盖；domain-adapter extension E2E 主路径已通过。 | Task 9.3 final regression |
| AC2 locator/workflow failure report + generic fallback | done | failure reporter 记录 adapter id/version、locator id、URL pattern、error code 和 generic fallback；8 个 adapter fixture tests 均覆盖 locator match、drift/failure fallback 和 versioned report metadata。 | Task 9.3 final regression |
| AC3 Cockpit 显示 adapter 启用状态 | done | DomainAdapterStatus 显示 detected/enabled/disabled、workflow hint count、locator hint count、drift fallback、last failure 和 global approval policy；disable/re-enable persistence 已由 domain-adapter extension E2E 覆盖。 | Task 9.3 final regression |
| AC4 adapter workflow 高风险动作仍 approval | done | 8 个 adapter fixture tests 覆盖 workflow 只返回 preview/approval boundary、不直接执行页面动作；高风险 workflow 返回 `APPROVAL_REQUIRED`，低风险 workflow 保持 read-only preview。 | Task 9.3 final regression |
| AC5 generic browser tools 不受影响 | done | adapter disabled fallback、generic tool tests、extension domain-adapter E2E 和 final full regression 通过。 | Task 9.3 done |
| AC6 改动范围偏离说明 | done | notes 已记录 DomainAdapter 为非执行型 hints，不绕过 ToolRouter/authorization/approval/verifier。 | Task 9.3 done |
| AC7 设计图主链路验收 | done | DomainAdapterStatus UI、disable/re-enable persistence、drift/failure visibility 和 extension E2E 主链路通过。 | Task 9.3 done |

## 汇总

| 类别 | 数量 |
| --- | ---: |
| done | 48 |
| partial | 0 |
| missing | 0 |
| blocked-by-security | 0 |
| deferred-by-scope | 0 |

最终验证：
1. `npm run typecheck`、`npm run lint -- --max-warnings=0`、`npm test`、`npm run test:coverage -- --reporter=dot`、`npm run build`、`npm run test:e2e`、`npm run check:release` 均已通过。
2. `npm run test:e2e` 中 real-sites / real-model opt-in 用例因 `BROWSER_HELM_REAL_SITE_E2E`、`BROWSER_HELM_REAL_MODEL_E2E` 和 provider credentials 未配置而按设计 skipped。
