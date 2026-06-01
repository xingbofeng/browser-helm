# BrowserHelm Tools

本目录存放 BrowserHelm 的工具实现。工具通过 `ToolSpec` 暴露给 Agent runtime，每个工具都必须声明 `name`、`title`、`description`、`modes`、`risk`、`argsSchema`、`resultSchema` 和 `execute`。

`title` 字段旁的代码注释用于说明工具在 Agent 语义里的用途：它不是 UI 文案替代品，而是维护者阅读工具清单时的快速定位。

## 已实现工具

| 工具名 | Title | 目录 | 模式 | 风险 | 参数 | 含义 |
| --- | --- | --- | --- | --- | --- | --- |
| `bh_agent_finish` | Agent Finish | `agent/` | `internal` | `safe` | `message` | Agent 正常完成当前 run，返回最终摘要。 |
| `bh_agent_fail` | Agent Fail | `agent/` | `internal` | `safe` | `message`, `code?` | Agent 无法继续或确认失败，返回结构化失败结果。 |
| `bh_agent_ask_user` | Agent Ask User | `agent/` | `internal` | `safe` | `question` | Agent 缺少必要用户输入时暂停 run，并把问题交还给用户。 |
| `bh_action_check_readiness` | Check Action Readiness | `action/` | `debug`, `act` | `low` | `kind`, `refId`, `source`, `valuePreview?` | 只读检查拟执行动作的目标、风险、approval 预判和重新观察需求，不修改页面。 |
| `bh_action_click` | Click Action | `action/` | `act` | `medium` | `refId`, `source?`, `valuePreview?` | 对已就绪且非高风险的 stable ref 执行真实点击；高风险目标阻断，不修改页面。 |
| `bh_adapter_detect_site` | Detect Domain Adapter | `adapter/` | `ask`, `debug`, `form`, `act` | `safe` | `url` | 检测 URL 是否命中站点 adapter，返回 guidance、workflow、locator 摘要或通用工具 fallback。 |
| `bh_adapter_list_workflows` | List Adapter Workflows | `adapter/` | `ask`, `debug`, `form`, `act` | `safe` | `url`, `workflowId?` | 列出站点 adapter workflow 模板；指定 workflow 不存在时记录失败并回退通用工具，命中高风险 workflow 时返回 approval boundary。 |
| `bh_adapter_apply_locator` | Apply Adapter Locator | `adapter/` | `ask`, `debug`, `form`, `act` | `safe` | `url`, `locatorId`, `candidates[]` | 将 adapter locator hint 应用到已观察候选元素；失败时记录 report 并回退通用工具。 |
| `bh_adapter_report_failure` | Report Adapter Failure | `adapter/` | `ask`, `debug`, `form`, `act` | `safe` | `url`, `adapterId`, `errorCode`, `message`, `workflowId?`, `locatorId?` | 记录 adapter workflow 或 locator 失败，不阻断通用工具。 |
| `bh_page_observe` | Page Observe | `page/` | `ask`, `debug`, `form` | `safe` | 无 | 读取当前页面 bounded observation，并生成裁剪后的 structured context summary。 |
| `bh_page_read_visible_text` | Read Visible Text | `page/` | `ask`, `debug`, `form` | `safe` | `cursor?`, `maxChars?` | 分页读取当前页面可见文本。 |
| `bh_page_read_article` | Read Article | `page/` | `ask`, `debug`, `form` | `safe` | `cursor?`, `maxChars?`, `includeHeadings?`, `includeLinks?` | 读取页面正文/文章内容。 |
| `bh_page_wait_until_stable` | Wait Until Stable | `page/` | `ask`, `debug`, `form` | `safe` | `quietMs?` | 等待页面 DOM 和布局稳定后返回。 |
| `bh_viewport_get_info` | Get Viewport Info | `viewport/` | `ask`, `debug` | `safe` | 无 | 读取当前视口位置、可滚动区域和边界。 |
| `bh_viewport_scroll` | Scroll Viewport | `viewport/` | `ask`, `debug` | `low` | `direction`, `amount` | 只读滚动视口用于观察，不改变页面业务状态。 |
| `bh_frame_list` | Frame List | `frame/` | `debug`, `form`, `act` | `safe` | 无 | 列出当前页面 frame id、URL 和顶层/子 frame 关系，用于 iframe 表单与动态 widget 排障。 |
| `bh_iframe_list` | List Iframes | `frame/` | `debug`, `act` | `safe` | 无 | 列出 iframe 及稳定 iframeId 元数据。 |
| `bh_iframe_read` | Read Iframe Target | `frame/` | `debug`, `act` | `low` | `refId`, `frameId?` | 只读读取 iframe 内 stable ref 摘要，不触发 approval，不修改页面。 |
| `bh_a11y_snapshot` | A11y Snapshot | `a11y/` | `ask`, `debug`, `form` | `safe` | 无 | 捕获当前页面 a11y-like 快照，返回带 stable refs 的候选元素。 |
 | `bh_a11y_find_interactive` | Find Interactive Elements | `a11y/` | `debug`, `form` | `safe` | 无 | 读取当前页面交互元素列表，包含 ref、role、name 和只读状态。 |
| `bh_a11y_refresh_refs` | Refresh Refs | `a11y/` | `ask`, `debug`, `form` | `safe` | 无 | 页面结构变化后刷新 ref map，重新建立 ref 到元素的映射。 |
| `bh_a11y_resolve_ref` | Resolve Ref | `a11y/` | `ask`, `debug`, `form` | `safe` | `refId` | 将已有 `ref_id` 解析为当前页面元素摘要，并暴露 `REF_STALE` 等错误。 |
| `bh_element_inspect` | Inspect Element | `element/` | `debug`, `form` | `safe` | `refId` | 检查单个交互元素的 role、name、tagName 和可用状态。 |
| `bh_element_read_state` | Read Element State | `element/` | `debug`, `form` | `safe` | `refId` | 读取单个交互元素的 visible、disabled、checked、selected 状态。 |
| `bh_form_list` | List Forms | `form/` | `debug`, `form` | `safe` | 无 | 列出当前页面表单概览，包括字段数量和 submit 状态。 |
| `bh_form_inspect` | Inspect Form | `form/` | `debug`, `form` | `safe` | `formRefId?` | 检查表单字段和 submit 摘要，不执行填写或提交。 |
| `bh_form_read_fields` | Read Form Fields | `form/` | `debug`, `form` | `safe` | 无 | 读取当前页面表单字段快照。 |
| `bh_form_find_missing_required` | Find Missing Required Fields | `form/` | `form` | `safe` | 无 | 找出 required 且当前值为空的字段。 |
| `bh_form_find_validation_errors` | Find Validation Errors | `form/` | `form` | `safe` | 无 | 找出 validation failed 或 aria-invalid 的字段。 |
| `bh_form_find_disabled_submit_reason` | Find Disabled Submit Reason | `form/` | `form` | `safe` | 无 | 读取 disabled submit 的已确认、推断或无法判断原因。 |
| `bh_debug_collect_page_health` | Collect Page Health | `debug/` | `debug` | `safe` | 无 | 收集页面健康浅层摘要，不使用 CDP。 |
| `bh_cdp_attach` | CDP Attach | `cdp/` | `debug` | `medium` | `tabId?`, `protocolVersion?` | 连接 Chrome debugger 并启用 Network/Runtime/Performance 采集。 |
| `bh_cdp_detach` | CDP Detach | `cdp/` | `debug` | `medium` | `tabId?` | 断开当前标签页的 debugger 会话。 |
| `bh_cdp_get_targets` | CDP Targets | `cdp/` | `debug` | `safe` | 无 | 列出 Chrome debugger target。 |
| `bh_cdp_get_console_events` | CDP Console Events | `cdp/` | `debug` | `safe` | `tabId?`, `limit?` | 读取 CDP 捕获的 console 事件。 |
| `bh_cdp_get_network_events` | CDP Network Events | `cdp/` | `debug` | `safe` | `tabId?` | 读取 CDP 捕获的 network 请求摘要。 |
| `bh_cdp_get_request_detail` | CDP Request Detail | `cdp/` | `debug` | `safe` | `requestId`, `tabId?` | 读取单个请求的状态、headers 和可用响应预览。 |
| `bh_cdp_get_response_body` | CDP Response Body | `cdp/` | `debug` | `safe` | `requestId`, `tabId?` | 读取单个请求的响应体或明确不可用原因。 |
| `bh_cdp_get_performance_metrics` | CDP Performance Metrics | `cdp/` | `debug` | `safe` | `tabId?` | 读取 CDP performance metrics。 |
| `bh_cdp_get_event_listeners` | CDP Event Listeners | `cdp/` | `debug` | `safe` | `tabId?`, `objectExpression?` | 读取 DOM 对象事件监听器摘要。 |
| `bh_cdp_capture_dom_snapshot` | CDP DOM Snapshot | `cdp/` | `debug` | `safe` | `tabId?` | 捕获 CDP DOMSnapshot 诊断载荷。 |
| `bh_vision_capture_viewport` | Capture Viewport Screenshot | `vision/` | `debug`, `vision` | `safe` | `windowId?` | 截取当前视口截图；原始 dataUrl 仅在工具结果内短暂使用，snapshot detail 会脱敏。 |
| `bh_vision_capture_full_page` | Capture Full Page Screenshot | `vision/` | `debug`, `vision` | `safe` | `windowId?` | 通过 CDP full-page capture 截取完整页面视觉参考，失败时才回退可见视口。 |
| `bh_vision_capture_element` | Capture Element Screenshot | `vision/` | `debug`, `vision` | `safe` | `selector`, `windowId?` | 截取指定元素并返回 bounds metadata，用于视觉/DOM 对照。 |
| `bh_vision_describe_viewport` | Describe Viewport With Vision | `vision/` | `debug`, `vision` | `safe` | `prompt?`, `windowId?` | 请求 vision-capable provider 生成视口摘要；不可用时返回 DOM/a11y fallback。 |
| `bh_vision_detect_overlay` | Detect Visual Overlay | `vision/` | `debug`, `vision` | `safe` | `prompt?`, `windowId?` | 聚焦检测浮层、弹窗、sticky header 或 banner 遮挡。 |
| `bh_vision_detect_layout_issues` | Detect Layout Issues | `vision/` | `debug`, `vision` | `safe` | `prompt?`, `windowId?` | 聚焦检测裁剪、覆盖、偏移和响应式布局异常。 |
| `bh_pointer_click` | Pointer Click | `pointer/` | `vision` | `medium` | `x`, `y`, `reason` | 仅作为视觉 fallback 最后手段点击坐标；敏感 reason 返回 approval required。 |
| `bh_tab_list` | List Browser Tabs | `tab/` | `advanced` | `safe` | 无 | 列出当前浏览器 tab 摘要，URL 去除 query/hash。 |
| `bh_tab_get_active` | Get Active Tab | `tab/` | `advanced` | `safe` | 无 | 读取当前 active tab 摘要，不改变浏览器状态。 |
| `bh_tab_focus` | Focus Browser Tab | `tab/` | `advanced` | `low` | `tabId` | 切换到指定 tab，并要求重新 observe 新目标。 |
| `bh_shadow_list` | List Shadow Roots | `shadow/` | `advanced` | `safe` | 无 | 列出页面 open shadow roots 的 host、文本预览和交互数量。 |
| `bh_shadow_query` | Query Shadow Root | `shadow/` | `advanced` | `safe` | `hostSelector`, `selector` | 在指定 open shadow root 内只读查询元素摘要。 |
| `bh_storage_list` | List Web Storage | `storage/` | `advanced` | `medium` | `area`, `limit?` | 列出 localStorage/sessionStorage 的 key、长度和脱敏预览；需要 domain consent。 |
| `bh_storage_get` | Get Web Storage Entry | `storage/` | `advanced` | `medium` | `area`, `key` | 读取单个 localStorage/sessionStorage 条目的存在性、长度和脱敏预览；不返回敏感原值。 |
| `bh_storage_set_with_approval` | Set Web Storage With Approval | `storage/` | `advanced` | `high` | `area`, `key`, `value` | 审批后写入单个 localStorage/sessionStorage 条目；工具调用和 trace 不暴露原始 value。 |
| `bh_storage_delete_with_approval` | Delete Web Storage With Approval | `storage/` | `advanced` | `high` | `area`, `key` | 审批后删除单个 localStorage/sessionStorage 条目，并要求重新 observe。 |
| `bh_storage_clear_with_approval` | Clear Web Storage With Approval | `storage/` | `advanced` | `high` | `area` | 审批后清空 localStorage/sessionStorage 区域，并返回受影响条目数。 |
| `bh_download_list` | List Downloads | `file/` | `advanced` | `safe` | `limit?`, `state?` | 列出最近下载记录，URL 去除 query/hash，本地路径只保留文件名。 |
| `bh_file_read_download` | Read Downloaded File | `file/` | `advanced` | `high` | `downloadId` | 本地下载文件读取安全外壳；需要审批，当前返回结构化不可读边界和 fallback。 |
| `bh_file_upload_with_approval` | Upload File With Approval | `file/` | `advanced` | `high` | `targetRefId`, `fileName?`, `reason?` | 本地文件上传审批安全外壳；不读取本地路径、不设置 file input，只创建审批和手动选择提示。 |
| `bh_doc_read_url` | Read Document URL | `doc/` | `advanced` | `safe` | `url`, `maxChars?`, `pageStart?`, `pageEnd?` | 读取浏览器可访问文本/PDF，返回页码、scanned 和截断信息。 |
| `bh_clipboard_read_with_approval` | Read Clipboard With Approval | `clipboard/` | `advanced` | `high` | 无 | 创建剪贴板读取审批；批准后通过 offscreen document 读取，snapshot detail 脱敏。 |
| `bh_clipboard_write_with_approval` | Write Clipboard With Approval | `clipboard/` | `advanced` | `high` | `text` | 创建剪贴板写入审批；工具调用本身不写入，批准后才修改系统剪贴板。 |
| `bh_form_infer_fill_plan` | Infer Fill Plan | `form/` | `form` | `low` | `userTask`, `formSummary`, `fields[]`, `formRefId?` | 根据用户任务和字段快照推断填写方案，输出 source/confidence/reason 和 masked preview。 |
| `bh_form_fill_field` | Fill Single Field | `form/` | `form` | `medium` | `fieldRefId`, `value`, `clear?` | 填写单个表单字段，含 guard 检查和 input/change/blur 事件触发。 |
| `bh_form_fill_many` | Batch Fill Many Fields | `form/` | `form` | `medium` | `fields[]`, `formRefId?` | 批量填写单个表单的多个字段，返回字段级 partial-success 结果。 |
| `bh_form_verify` | Verify Form | `form/` | `form`, `debug` | `low` | `fieldRefIds[]`, `formRefId?`, `submitRefId?` | 验证表单准备状态，检查 HTML5 有效性、必填字段、可见错误文本和提交按钮状态。 |
| `bh_form_submit_with_approval` | Submit Form (Approval Required) | `form/` | `form` | `high` | `formName`, `submitMethod`, `verifyStatus`, `fields[]` 等 | 提交审批阻断工具，需要用户明确确认后才执行真实提交。 |
| `bh_memory_lookup` | Memory Lookup | `memory/` | `memory` | `low` | `domain`, `query?`, `limit?` | 查询当前 domain 的本地可复用记忆命中，只返回摘要和分数。 |
| `bh_memory_save` | Memory Save | `memory/` | `memory` | `low` | `domain`, `task`, `summary`, `tags?` | 保存脱敏后的本地 domain memory，不改变页面。 |
| `bh_memory_update` | Memory Update | `memory/` | `memory` | `low` | `id`, `task?`, `summary?`, `tags?` | 更新本地 memory 摘要、标签或成功/失败计数。 |
| `bh_memory_delete` | Memory Delete | `memory/` | `memory` | `low` | `id` | 删除一条本地 memory。 |
| `bh_memory_list` | Memory List | `memory/` | `memory` | `low` | `domain?` | 列出本地 memory，支持按 domain 过滤。 |
| `bh_memory_clear_domain` | Memory Clear Domain | `memory/` | `memory` | `low` | `domain` | 删除某个 domain 的全部本地 memory。 |
| `bh_memory_clear_all` | Memory Clear All | `memory/` | `memory` | `low` | 无 | 清空全部本地 memory，主要用于隐私控制和测试清理。 |
| `bh_memory_explain_hit` | Memory Explain Hit | `memory/` | `memory` | `low` | `id` | 解释某条 memory 的命中原因和成功/失败计数。 |
| `bh_pad_read` | Scratchpad Read | `pad/` | `memory` | `safe` | `runId?` | 读取当前 run scratchpad 摘要。 |
| `bh_pad_append` | Scratchpad Append | `pad/` | `memory` | `safe` | `text`, `runId?` | 向当前 run scratchpad 追加脱敏文本。 |
| `bh_pad_replace` | Scratchpad Replace | `pad/` | `memory` | `safe` | `text`, `runId?` | 替换当前 run scratchpad 内容。 |
| `bh_pad_clear` | Scratchpad Clear | `pad/` | `memory` | `safe` | `runId?` | 清空当前 run scratchpad。 |
| `bh_pad_compact` | Scratchpad Compact | `pad/` | `memory` | `safe` | `maxChars?`, `runId?` | 按预算保留最近 scratchpad 内容。 |
| `bh_flow_lookup` | Workflow Lookup | `workflow/` | `memory` | `low` | `domain`, `query?`, `limit?` | 查询某个 domain 的本地可复用 workflow。 |
| `bh_flow_preview` | Workflow Preview | `workflow/` | `memory` | `low` | `id` | 生成 workflow replay preview，不执行页面动作。 |
| `bh_flow_run_with_approval` | Workflow Run With Approval | `workflow/` | `memory` | `high` | `id` | 在 workflow replay 前创建 approval 阻断，不静默执行。 |
| `bh_flow_step` | Workflow Step | `workflow/` | `memory` | `low` | `id`, `index` | 读取 workflow replay 的单个步骤摘要。 |
| `bh_flow_stop` | Workflow Stop | `workflow/` | `memory` | `low` | `id` | 停止 workflow replay 会话。 |
| `bh_flow_save` | Workflow Save | `workflow/` | `memory` | `low` | `domain`, `intent`, `taskDescription`, `steps[]` | 保存脱敏后的可复用 workflow memory。 |
| `bh_flow_update` | Workflow Update | `workflow/` | `memory` | `low` | `id`, `intent?`, `taskDescription?`, `steps?` | 更新 workflow memory 描述、步骤或评分。 |
| `bh_flow_delete` | Workflow Delete | `workflow/` | `memory` | `low` | `id` | 删除一个 workflow memory。 |
| `bh_flow_score` | Workflow Score | `workflow/` | `memory` | `low` | `id`, `outcome` | 记录 workflow replay 成功或失败结果。 |

## 目录约定

| 目录 | 责任 |
| --- | --- |
| `agent/` | Agent 内部控制工具，用于 finish、fail、ask user 等 run 级状态。 |
 | `action/` | 动作准备状态和动作前安全检查工具。 |
| `page/` | 页面观察入口，负责从 content runtime 获取页面 observation。 |
| `frame/` | frame/iframe 只读读取和诊断工具。 |
| `a11y/` | a11y-like snapshot、stable ref map 和 ref 解析工具。 |
 | `element/` | 单元素检查和状态读取工具。 |
 | `form/` | 表单读取和诊断工具。 |
| `debug/` | 页面健康浅层诊断工具，不承接 CDP deep tools。 |
| `cdp/` | Chrome debugger / CDP deep inspect 工具，负责 request、console、performance 和 event listener 读取。 |
| `vision/` | screenshot capture、vision summary、overlay/layout issue 检测和 DOM/a11y fallback。 |
| `pointer/` | 坐标点击 fallback 工具，必须由视觉检查和风险判断驱动。 |
| `tab/` | 多 tab 上下文读取与焦点切换工具，服务 advanced browser workflow。 |
| `shadow/` | open shadow root 发现与只读元素查询工具。 |
| `storage/` | localStorage/sessionStorage 只读检查工具，服务 advanced browser state workflow。 |
| `memory/` | domain memory 查询、写入、删除和命中解释工具。 |
| `pad/` | 当前 run scratchpad 的读写、清理和压缩工具。 |
| `workflow/` | workflow memory 查询、预览、审批阻断和评分工具。 |
| `core/` | 工具注册、路由、结果工厂、错误和上下文类型。 |

## 新增工具要求

- 工具文件名使用 kebab-case，协议名保留 `bh_` 前缀。
- `title` 字段旁必须有一句注释，说明工具的 Agent 语义和使用时机。
- `description` 面向模型工具契约，必须短而明确。
- 高风险或会修改页面状态的工具必须正确设置 `risk`，并走 approval policy。
- 新工具加入后必须同步更新本 README 的已实现工具表格。
