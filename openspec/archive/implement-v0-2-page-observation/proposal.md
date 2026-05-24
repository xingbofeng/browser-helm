## Why

BrowserHelm v0.1 只能让 agent kernel 运行 mock 工具，agent 还不能观察真实网页，也无法基于可见页面状态做推理。v0.2 要建立第一个真实浏览器只读层：content script 页面观察、accessibility-like snapshot 和 stable ref，为后续结构化页面数据、cockpit UI、表单诊断和安全动作打基础。

## What Changes

- 新增 content script RPC，用于 extension runtime 发起只读 page/a11y observation。
- 新增真实页面观察工具：`bh_page_observe`、`bh_a11y_snapshot`、`bh_a11y_resolve_ref`、`bh_a11y_refresh_refs`。
- 新增 observation 数据契约：URL、title、currentDomain、origin、visible text summary、page state summary、interactive candidates、ref highlights。
- 新增 accessibility-like 序列化能力，识别按钮、输入框、链接等常见交互元素，避免让模型猜 CSS selector。
- 新增 ref map 生命周期：stable `ref_id` 生成、DOM node 解析、刷新、stale ref 检测。
- 新增上下文安全规则：full observation 进入 trace/storage，模型上下文只接收受限的 `ObservationContextSummary`。
- 新增结构化错误：content script 不可用、ref 缺失/失效、observation 超预算、observation 失败。
- 新增 prompt injection fixture，验证页面文字只作为 data 处理，不会升级为 system/developer/tool instruction。
- 新增 roadmap 描述的只读 MVP side panel 状态：页面观察、Ref 映射、empty、error。

## Capabilities

### New Capabilities

- `page-observation`：真实 page/a11y observation、stable ref 映射、observation summary、content RPC 错误处理，以及 prompt-injection-safe 上下文边界。

### Modified Capabilities

- 无。

## Impact

- 影响源码范围：`src/entrypoints/content.ts`、`src/entrypoints/background.ts`、`src/page/**`、`src/tools/page/**`、`src/tools/a11y/**`、`src/shared/schemas/**`、`src/shared/errors/**`、`src/agent/context/**`、side panel UI entrypoints。
- 影响测试范围：新增 `tests/dom/page/**` DOM 测试、`tests/node/tools/**` 工具测试、`tests/fixtures/pages/**` 页面 fixture，以及可行范围内的 browser/extension integration 测试。
- Runtime 影响：引入真实 content script 通信和只读 DOM/a11y inspection，同时保持 v0.1 的 kernel 边界：agent 代码不直接访问 browser APIs。
- 安全影响：页面文本和 DOM 派生内容必须始终作为工具结果/摘要里的 data；完整 DOM、a11y tree、ref map payload 不得直接注入模型 prompt。

---

## Archive Information

**Archived:** 2026-05-24 13:02
**Duration:** 0 days
**Outcome:** Successfully implemented

### Files Modified
- `src/entrypoints/content.ts`
- `src/entrypoints/background.ts`
- `src/entrypoints/sidepanel/**`
- `src/page/**`
- `src/tools/page/**`
- `src/tools/a11y/**`
- `src/runtime/**`
- `src/background/runtime/**`
- `src/shared/**`
- `tests/dom/**`
- `tests/e2e/**`
- `tests/node/**`

### Specs Updated
- `openspec/specs/page-observation/spec.md`

### Verification
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:e2e`
- System Chrome manual side panel acceptance passed
