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
```

该工具读取浅层页面健康摘要。当前 page-health hook 默认注入页面主世界以捕获 console/network failure 摘要；它不采集 cookie、密码字段或用户输入。后续 v1.3 会收敛为 Debug mode opt-in，并优先使用 CDP deep debug 替代可替代场景。

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
| `bh_action_check_readiness` | `low` | 否 | 否 |

## 4. 后续规划边界

### v1.2

v1.2 聚焦持久化记忆、工作流 replay、MV3 生命周期恢复和上下文预算治理，不新增通用页面 mutating action 作为主目标。

### v1.3

v1.3 聚焦 DevTools/CDP deep debug。page-health hook 会变成 Debug mode opt-in fallback，并增加 URL/path/query/fragment 脱敏。

### v1.5 之后

通用元素点击、输入、导航、键盘、选择、剪贴板、下载、文件上传等 action 只能在完整 ToolSelector、domain policy、approval resume flow、stale ref 校验和 E2E 覆盖齐备后引入。未实现前不得写入当前工具表或 prompt-visible contract。

## 5. 维护要求

- 新增工具必须同步维护 `src/tools/README.md`、README 工具表和必要测试。
- 删除工具必须删除 ToolSpec 文件、`TOOL_NAMES` 常量、i18n 描述、公开文档和模型可见 contract。
- 高风险或会修改页面状态的工具必须正确设置 `risk`，并走 approval policy。
- 当前工具文档以实际 ToolRegistry 为准，不以历史 roadmap 或研究笔记为准。
