# BrowserHelm Tools

BrowserHelm 的工具协议统一使用 `bh_` 前缀。本文档只描述当前公开工具面和后续规划边界；已经移除或尚未实现的工具不进入当前工具清单，也不会写入 Agent prompt。

## 1. 命名规则

```txt
bh_<domain>_<verb>_<object>
```

示例：

```txt
bh_page_observe
bh_a11y_snapshot
bh_element_inspect
bh_form_verify
bh_form_submit_with_approval
```

禁止使用容易和其他浏览器 Agent 项目撞名的通用名：

```txt
click
type
scroll
navigate
read_page
screenshot
done
execute_js
new_tab
get_accessibility_tree
browser_click
browser_type
lookup_memories
save_memory
scratchpad_write
```

## 2. 当前公开工具面

当前工具通过 `src/tools/index.ts` 自动发现并注册。只有注册表中的工具会进入 ToolRouter 和模型可见 tool contract。

### Agent control

```txt
bh_agent_finish
bh_agent_fail
bh_agent_ask_user
```

### Page observation / reading

```txt
bh_page_observe
bh_page_read_visible_text
bh_page_read_article
bh_page_wait_until_stable
```

### Frame / iframe read-only tools

```txt
bh_frame_list
bh_iframe_list
bh_iframe_read
```

说明：当前只暴露 iframe 只读读取能力。iframe 内点击、输入等 mutating action 不作为公开工具暴露给模型。

### A11y discovery

```txt
bh_a11y_snapshot
bh_a11y_find_interactive
bh_a11y_resolve_ref
bh_a11y_refresh_refs
```

### Element inspection

```txt
bh_element_inspect
bh_element_read_state
```

说明：当前 element 工具只做检查和状态读取，不执行点击、输入、清空、键盘等 mutating action。

### Viewport

```txt
bh_viewport_get_info
bh_viewport_scroll
```

`bh_viewport_scroll` 会改变视口位置，但不改变页面业务数据。Ask 模式中它只作为观察辅助动作使用，执行后必须重新 observe/read。

### Form diagnosis / assisted fill

```txt
bh_form_list
bh_form_inspect
bh_form_read_fields
bh_form_find_missing_required
bh_form_find_validation_errors
bh_form_find_disabled_submit_reason
bh_form_infer_fill_plan
bh_form_fill_field
bh_form_fill_many
bh_form_verify
bh_form_submit_with_approval
```

表单填写工具必须满足显式值来源、字段状态、敏感字段和审批策略约束。表单提交永远通过 `bh_form_submit_with_approval` 创建审批请求，用户批准前不会真实提交。

### Debug

```txt
bh_debug_collect_page_health
bh_cdp_attach
bh_cdp_detach
bh_cdp_get_targets
bh_cdp_get_console_events
bh_cdp_get_network_events
bh_cdp_get_request_detail
bh_cdp_get_response_body
bh_cdp_get_performance_metrics
bh_cdp_get_event_listeners
bh_cdp_capture_dom_snapshot
```

Debug 工具分两层：`bh_cdp_*` 通过 `debugger` 权限连接当前 tab，采集 Network、Runtime、Performance 和 DOM 诊断数据；`bh_debug_collect_page_health` 是浅层 fallback，只在 Debug mode 调用时按需启用临时 `page-health-hook.js`，不能替代完整 DevTools/CDP 诊断。临时 hook 消息必须带 content bridge 生成的 session nonce；CDP 与 page-health 输出都会在进入模型上下文前做敏感 header、cookie、token、URL query/path/fragment 和明显 provider secret 脱敏。

### Vision / screenshot

```txt
bh_vision_capture_viewport
bh_vision_capture_full_page
bh_vision_capture_element
bh_vision_describe_viewport
bh_vision_detect_overlay
bh_vision_detect_layout_issues
```

Vision 工具是 DOM/a11y 主路径的增强，不是 screenshot-first loop。`bh_vision_capture_full_page` 优先走 CDP full-page capture，并在不可用时明确回退可见视口。截图结果可以用于 vision provider 输入，但原始 `dataUrl` 不进入 trace payload，持久化 snapshot detail 会替换成 `[MASKED_IMAGE_DATA]`。provider 不支持视觉输入时，`bh_vision_describe_viewport` 返回 `VISION_UNAVAILABLE` 和 `fallback: dom_a11y`，runtime 保持 run 为 observed，不阻断已有页面观察。

### Pointer fallback

```txt
bh_pointer_click
```

`bh_pointer_click` 只在 DOM/a11y ref 路径不可用、且 vision 检查给出明确坐标原因时使用。它会真实改变页面状态，普通视觉 fallback 为 `medium` risk；如果 reason 命中支付、提交、删除、密码、上传等敏感场景，工具不会点击，而是返回 approval required。

### Advanced tab tools

```txt
bh_tab_list
bh_tab_get_active
bh_tab_focus
bh_shadow_list
bh_shadow_query
bh_download_list
bh_file_read_download
bh_file_upload_with_approval
bh_doc_read_url
bh_clipboard_read_with_approval
bh_clipboard_write_with_approval
```

Tab 工具用于多标签工作流的目标枚举和焦点切换。`bh_tab_list` / `bh_tab_get_active` 只读并移除 URL query/hash；`bh_tab_focus` 只切换已有 tab 焦点，执行后必须重新 observe 新目标。Shadow 工具只读取 open shadow root，不穿透 closed shadow root，也不执行 shadow 内点击/输入。Download/file 工具覆盖下载记录读取、本地文件读取边界和上传审批边界：`bh_download_list` 只返回脱敏元数据；`bh_file_read_download` 是高风险 approval-gated 安全外壳；`bh_file_upload_with_approval` 不读取本地路径、不设置 file input，只创建审批和手动文件选择提示。Doc 工具 `bh_doc_read_url` 读取浏览器可访问文本/PDF，返回文本、页码范围、总页数、scanned 和 truncated。Clipboard 工具只创建审批，请求本身不读写系统剪贴板；批准后通过 offscreen document 执行真实读写，snapshot detail 对剪贴板内容脱敏。

### Action readiness

```txt
bh_action_check_readiness
```

该工具只读检查拟执行动作的目标、风险和 approval 预判，不修改页面。

## 3. 风险标注

| 工具 | 风险 | 是否改变页面 | 是否要求重新 observe/read |
| --- | --- | --- | --- |
| `bh_page_observe` | `safe` | 否 | 否 |
| `bh_page_read_visible_text` | `safe` | 否 | 否 |
| `bh_page_read_article` | `safe` | 否 | 否 |
| `bh_page_wait_until_stable` | `safe` | 否 | 是 |
| `bh_frame_list` / `bh_iframe_list` / `bh_iframe_read` | `safe` 或 `low` | 否 | 否 |
| `bh_a11y_*` | `safe` | 否 | 否 |
| `bh_element_inspect` / `bh_element_read_state` | `safe` | 否 | 否 |
| `bh_viewport_get_info` | `safe` | 否 | 否 |
| `bh_viewport_scroll` | `low` | 是，仅改变视口位置 | 是 |
| `bh_form_*` 诊断工具 | `safe` | 否 | 否 |
| `bh_form_infer_fill_plan` | `low` | 否 | 否 |
| `bh_form_fill_field` / `bh_form_fill_many` | `medium` | 是，修改表单字段 | 是 |
| `bh_form_verify` | `low` | 否 | 否 |
| `bh_form_submit_with_approval` | `high` | 否，创建审批请求 | 用户批准后真实提交并重新 observe |
| `bh_debug_collect_page_health` | `safe` | 否 | 否 |
| `bh_cdp_attach` / `bh_cdp_detach` | `medium` | 否，仅改变扩展 debugger attach 状态 | 否 |
| `bh_cdp_get_*` / `bh_cdp_capture_dom_snapshot` | `safe` | 否 | 否 |
| `bh_vision_capture_*` / `bh_vision_describe_viewport` / `bh_vision_detect_*` | `safe` | 否 | 否 |
| `bh_pointer_click` | `medium`，敏感场景升级为 approval required | 是，点击视口坐标 | 是 |
| `bh_tab_list` / `bh_tab_get_active` | `safe` | 否 | 否 |
| `bh_tab_focus` | `low` | 否，仅改变浏览器焦点 | 是 |
| `bh_shadow_list` / `bh_shadow_query` | `safe` | 否 | 否 |
| `bh_download_list` | `safe` | 否 | 否 |
| `bh_file_read_download` | `high` | 否，创建审批/边界说明 | 否 |
| `bh_file_upload_with_approval` | `high` | 否，创建审批/手动选择提示 | 是 |
| `bh_doc_read_url` | `safe` | 否 | 否 |
| `bh_clipboard_read_with_approval` | `high` | 否，批准后读取系统剪贴板 | 否 |
| `bh_clipboard_write_with_approval` | `high` | 是，批准后修改系统剪贴板 | 否 |
| `bh_action_check_readiness` | `low` | 否 | 否 |

## 4. 后续规划边界

### v1.2

v1.2 聚焦持久化记忆、工作流 replay、MV3 生命周期恢复和上下文预算治理，不新增通用页面 mutating action 作为主目标。

### v1.3

v1.3 聚焦 DevTools/CDP deep debug。page-health hook 已收敛为 Debug mode opt-in fallback，并增加 URL/path/query/fragment 脱敏。

### v1.4

v1.4 聚焦 Vision/Screenshot Agent。新增 screenshot capture、vision summary、overlay/layout issue 检测、Vision Panel 和 pointer fallback；仍保留 DOM/a11y 为主路径，不做 screenshot-first loop。

### v1.5 之后

v1.5 已补 tab、frame/iframe、shadow、下载元数据读取、本地文件读取边界、上传审批边界、浏览器可访问文档/PDF 读取和审批后的 clipboard 读写。后续继续补更完整的文件内容处理。通用元素点击、输入、导航、键盘、选择、真实自动设置 file input 等 action 只能在完整 ToolSelector、domain policy、approval resume flow、stale ref 校验和 E2E 覆盖齐备后引入。未实现前不得写入当前工具表或 prompt-visible contract。

## 5. 维护要求

- 新增工具必须同步维护 `src/tools/README.md`、README 工具表和必要测试。
- 删除工具必须删除 ToolSpec 文件、`TOOL_NAMES` 常量、i18n 描述、公开文档和模型可见 contract。
- 高风险或会修改页面状态的工具必须正确设置 `risk`，并走 approval policy。
- 当前工具文档以实际 ToolRegistry 为准，不以历史 roadmap 或研究笔记为准。
