## Why

v0.31/v0.32 已经让 BrowserHelm 能只读识别交互元素和表单字段，但后续动作工具仍缺少统一的动作前安全检查、风险分级、iframe 操作边界和 approval hook。v0.33 需要先建立“动作准备状态 / Action Readiness”这道安全检查站，让未来 click/type/submit 等能力有可复用的 runtime 契约，而不是直接修改页面。

同时，真实网页中大量关键控件位于 iframe 内；BrowserHelm 已经能聚合 iframe observation，但还缺少可复用的 iframe read/click/type 工具。随着 `bh_` 工具数量增加，本期也需要把工具头部 TSDoc/JSDoc 注释补齐为维护金标准。

## What Changes

- 新增动作准备状态契约：检查目标 ref 是否有效、页面是否变化、元素是否可操作、动作与目标是否匹配、风险等级和是否需要重新 observe。
- 新增 `动作准备 / Act` run mode：只允许动作准备、受控 iframe 动作和 approval 相关能力，不代表完全自动执行。
- 新增模型可见只读工具 `bh_action_check_readiness`，用于显式检查某个拟执行动作是否具备进入“准备执行 / 等待审批 / 需要重新观察 / 不可执行”的条件。
- 新增 iframe 工具原型：
  - `bh_iframe_read`：只读读取 iframe/ref 目标。
  - `bh_iframe_click`：对 iframe 内目标执行受控 click，必须先通过 readiness/policy。
  - `bh_iframe_type`：对 iframe 内目标执行受控 type，必须先通过 readiness/policy，并对敏感输入做 mask。
- 将现有 `bh_frame_list` 从 page 工具边界迁移到 frame 工具边界，并保持工具名和行为兼容。
- 建立最小 approval runtime hook：高风险动作生成 `ApprovalRequest`，run 进入 `waiting_for_approval`；deny 返回 `USER_DENIED_APPROVAL` 并写入 trace。
- 所有 iframe click/type 成功后返回 `changedPage=true` 和 `requiresObserve=true`，提示后续重新观察。
- 所有 run mode、动作类型和风险等级的用户可见文案使用中英文双语。
- v0.33 一次性补齐所有现有 `src/tools/**/bh-*.ts` 工具的 TSDoc/JSDoc 风格头部注释，并同步检查 `src/tools/README.md`。
- 明确 non-goals：
  - 不做 `iframe_submit`。
  - 不做完整 click/type/nav 工具体系。
  - 不做自动填表。
  - 不做完整 approval UI。
  - 不做 workflow replay、memory 或 sub-agent。

## Capabilities

### New Capabilities

- `action-readiness`: 动作准备状态、动作意图、ref freshness、页面变化、元素可操作性、风险和 `bh_action_check_readiness` 工具契约。
- `frame-actions`: frame/iframe 工具边界、复合 refId、`bh_iframe_read`、`bh_iframe_click`、`bh_iframe_type` 和 `bh_frame_list` 迁移兼容契约。
- `approval-runtime-hook`: 最小 approval request、approval decision、`waiting_for_approval`、approve/deny runtime 契约和 trace 行为。
- `tool-documentation`: `src/tools/**/bh-*.ts` 工具头部 TSDoc/JSDoc 金标准、历史工具补齐和 README 清单一致性。

### Modified Capabilities

- `run-mode-gate`: 增加 `动作准备 / Act` run mode，并定义 Ask/Debug/Form/Act 的双语展示和工具可见性边界。

## Impact

- 影响 `src/shared/schemas/`：新增 action readiness / action intent / approval decision 等 schema，扩展 run mode。
- 影响 `src/page/dom/`、`src/page/messaging/` 和 content RPC：新增动作前检查、页面变化检测、iframe read/click/type 消息与失败路径。
- 影响 `src/tools/action/` 和 `src/tools/frame/`：新增 action readiness 与 iframe 工具，迁移 `bh_frame_list`。
- 影响 `src/agent/policy/` 和 `src/runtime/approval/`：扩展 risk classifier、PolicyEngine 和最小 approval lifecycle。
- 影响 `src/agent/kernel/`、trace schema 和 runtime messages：补齐 approval hook、decision 事件和 `USER_DENIED_APPROVAL` 行为。
- 影响 `src/entrypoints/sidepanel/`：仅做最小双语 mode/status 文案对齐，不实现完整 approval UI。
- 影响 `src/tools/README.md` 和所有现有 `src/tools/**/bh-*.ts`：补齐工具注释金标准和清单一致性。
- 测试影响包括 shared schema、DOM/page action readiness、content RPC iframe actions、tool router/policy、approval runtime、side panel 最小文案和 extension E2E。
