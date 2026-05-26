# BrowserHelm Tools

BrowserHelm 的工具命名统一使用 `bh_` 前缀，避免和 Sarathi、WebBrain、BrowserBee、BrowserKing、onUI 等项目撞名。

## 1. 命名规则

```txt
bh_<domain>_<verb>_<object>
```

示例：

```txt
bh_page_observe
bh_a11y_snapshot
bh_element_click
bh_form_verify
bh_memory_lookup
```

禁止早期使用这些容易撞名的通用名：

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

## 2. v1.0 必须工具

### Agent control

```txt
bh_agent_finish
bh_agent_fail
bh_agent_ask_user
```

### Page observation

```txt
bh_page_observe
bh_page_read_visible_text
bh_page_read_article
bh_page_wait_until_stable
```

### A11y discovery

```txt
bh_a11y_snapshot
bh_a11y_find_interactive
bh_a11y_resolve_ref
bh_a11y_refresh_refs
```

### Element inspection / low-risk actions

```txt
bh_element_inspect
bh_element_get_computed_style
bh_element_focus
```

### Navigation / viewport

```txt
bh_nav_open_url
bh_nav_reload
bh_nav_back
bh_nav_forward
```

### Form tools

```txt
bh_form_list
bh_form_inspect
bh_form_read_fields
bh_form_find_missing_required
bh_form_find_validation_errors
bh_form_find_disabled_submit_reason
```

### Debug tools

```txt
bh_debug_collect_page_health
bh_debug_get_console_errors
bh_debug_get_network_failures
bh_debug_explain_error
```

### Policy tools / internal capabilities

```txt
bh_policy_mask_secrets
```

## 3. v1.1 扩展工具

```txt
bh_element_click
bh_element_clear
bh_element_type_text
bh_element_set_value
bh_element_press_key
bh_viewport_scroll
bh_viewport_scroll_to_element
bh_form_fill_field
bh_form_fill_many
bh_form_verify
bh_form_submit_with_approval
bh_debug_get_console_logs
bh_debug_get_network_summary
bh_debug_inspect_selected_element
bh_policy_classify_risk
bh_policy_request_approval
```

## 4. v1.0.2 补齐边界

v1.0.2 一次性补齐 v1.0 必须工具缺口，并提前纳入长页面 / iframe 读取闭环所需的 viewport 工具。用户任务必须进入真实 AgentLoop tool-calling 路径，不能只基于一次 snapshot provider answer。

### v1.0.2 最终工具面

#### Agent control

```txt
bh_agent_finish
bh_agent_fail
bh_agent_ask_user
```

#### Page observation / reading

```txt
bh_page_observe
bh_page_read_visible_text
bh_page_read_article
bh_page_wait_until_stable
```

#### Iframe

```txt
bh_iframe_list
bh_iframe_read
```

#### A11y discovery

```txt
bh_a11y_snapshot
bh_a11y_find_interactive
bh_a11y_resolve_ref
bh_a11y_refresh_refs
```

#### Element inspection

```txt
bh_element_inspect
bh_element_read_state
bh_element_get_computed_style
bh_element_focus
```

#### Element actions

```txt
bh_element_click
bh_element_type_text
```

`bh_iframe_click` 和 `bh_iframe_type` 不保留 deprecated 工具；iframe 内元素动作统一迁移到 `bh_element_click` 和 `bh_element_type_text`，由 stable ref / resolver 处理元素所在 iframe 上下文。

#### Navigation

```txt
bh_nav_open_url
bh_nav_reload
bh_nav_back
bh_nav_forward
```

#### Viewport

```txt
bh_viewport_get_info
bh_viewport_scroll
```

`bh_viewport_scroll` 支持 `target: page | iframe`。滚动 iframe 不新增 `bh_iframe_scroll`；iframe 和顶层页面都属于 viewport scroll context。

#### Form tools

```txt
bh_form_list
bh_form_inspect
bh_form_read_fields
bh_form_find_missing_required
bh_form_find_validation_errors
bh_form_find_disabled_submit_reason
```

#### Debug tools

```txt
bh_debug_collect_page_health
bh_debug_get_console_errors
bh_debug_get_network_failures
bh_debug_explain_error
```

#### Policy tools

```txt
bh_policy_mask_secrets
```

#### Action readiness

```txt
bh_action_check_readiness
```

### v1.0.2 风险标注

| 工具 | 风险 | 是否改变页面 | 是否要求重新 observe/read |
| --- | --- | --- | --- |
| `bh_page_read_visible_text` | `safe` | 否 | 否 |
| `bh_page_read_article` | `safe` | 否 | 否 |
| `bh_page_wait_until_stable` | `safe` | 否 | 是 |
| `bh_iframe_list` | `safe` | 否 | 否 |
| `bh_iframe_read` | `safe` | 否 | 否 |
| `bh_viewport_get_info` | `safe` | 否 | 否 |
| `bh_viewport_scroll` | `low` | 是，改变视口位置 | 是 |
| `bh_element_focus` | `low` | 是，改变焦点 | 是 |
| `bh_element_click` | `high` | 是 | 是 |
| `bh_element_type_text` | `high` | 是 | 是 |
| `bh_nav_open_url` | `medium` | 是，改变页面位置 | 是 |
| `bh_nav_reload` / `bh_nav_back` / `bh_nav_forward` | `low` | 是，改变页面位置 | 是 |
| 其余 v1.0.2 只读诊断工具 | `safe` | 否 | 否 |

## 5. 完整版工具清单

### Agent control

```txt
bh_agent_finish
bh_agent_fail
bh_agent_ask_user
bh_agent_pause
bh_agent_resume
bh_agent_cancel
bh_agent_report_progress
```

### Page observation

```txt
bh_page_observe
bh_page_summarize
bh_page_read_visible_text
bh_page_read_article
bh_page_read_selection
bh_page_read_metadata
bh_page_detect_state
bh_page_wait_until_stable
bh_page_watch_mutations
```

### A11y / element discovery

```txt
bh_a11y_snapshot
bh_a11y_focus_tree
bh_a11y_find_by_role
bh_a11y_find_by_name
bh_a11y_find_interactive
bh_a11y_resolve_ref
bh_a11y_refresh_refs
```

### Element inspection

```txt
bh_element_inspect
bh_element_describe
bh_element_get_bounds
bh_element_get_attributes
bh_element_get_computed_style
bh_element_get_accessible_name
bh_element_get_label
bh_element_get_value
bh_element_get_state
bh_element_find_by_text
bh_element_find_by_selector
bh_element_find_by_label
bh_element_find_by_placeholder
```

### Element actions

```txt
bh_element_click
bh_element_double_click
bh_element_right_click
bh_element_hover
bh_element_focus
bh_element_blur
bh_element_scroll_into_view
bh_element_clear
bh_element_type_text
bh_element_set_value
bh_element_press_key
bh_element_select_option
bh_element_toggle_checked
bh_element_drag_to
```

### Navigation

```txt
bh_nav_open_url
bh_nav_reload
bh_nav_back
bh_nav_forward
bh_nav_wait_for_url
bh_nav_wait_for_title
bh_nav_wait_for_route_change
bh_nav_detect_redirect
```

### Viewport

```txt
bh_viewport_get_info
bh_viewport_scroll
bh_viewport_scroll_to_top
bh_viewport_scroll_to_bottom
bh_viewport_scroll_to_element
bh_viewport_resize
bh_viewport_get_visible_region
```

### Forms

```txt
bh_form_list
bh_form_inspect
bh_form_read_fields
bh_form_fill_field
bh_form_fill_many
bh_form_verify
bh_form_find_missing_required
bh_form_find_validation_errors
bh_form_find_disabled_submit_reason
bh_form_prepare_submit
bh_form_submit_with_approval
bh_form_reset
```

### Debug

```txt
bh_debug_collect_page_health
bh_debug_get_console_errors
bh_debug_get_console_logs
bh_debug_get_runtime_exceptions
bh_debug_get_network_failures
bh_debug_get_network_summary
bh_debug_explain_error
bh_debug_inspect_selected_element
bh_debug_detect_hydration_issue
bh_debug_detect_broken_interaction
```

### DevTools / CDP

```txt
bh_cdp_attach
bh_cdp_detach
bh_cdp_get_targets
bh_cdp_get_console_events
bh_cdp_get_network_events
bh_cdp_get_request_detail
bh_cdp_get_response_body
bh_cdp_get_performance_metrics
bh_cdp_get_coverage
bh_cdp_evaluate_runtime
bh_cdp_get_event_listeners
bh_cdp_capture_dom_snapshot
```

### Storage / cookies

```txt
bh_storage_read_local
bh_storage_read_session
bh_storage_read_indexeddb_summary
bh_storage_read_cookies_summary
bh_storage_clear_site_data_with_approval
bh_storage_mask_sensitive_values
```

### Network / fetch

```txt
bh_net_fetch_url
bh_net_fetch_text
bh_net_fetch_json
bh_net_check_link
bh_net_probe_resource
bh_net_blocked_reason
bh_net_replay_request_with_approval
```

### Vision

```txt
bh_vision_capture_viewport
bh_vision_capture_full_page
bh_vision_capture_element
bh_vision_describe_viewport
bh_vision_detect_overlay
bh_vision_detect_layout_issue
bh_vision_compare_viewports
bh_vision_locate_text
bh_vision_locate_control
```

### Pointer

```txt
bh_pointer_move
bh_pointer_click_xy
bh_pointer_double_click_xy
bh_pointer_drag_xy
bh_pointer_scroll_xy
```

### Tabs

```txt
bh_tab_list
bh_tab_get_active
bh_tab_open
bh_tab_activate
bh_tab_close
bh_tab_duplicate
bh_tab_reload
bh_tab_group_summary
```

### Frames

```txt
bh_iframe_list
bh_iframe_read
```

iframe 只表达嵌入页面发现与文档读取边界。具体元素检查和动作使用 element 工具；页面或 iframe 滚动使用 viewport 工具。

### Shadow DOM

```txt
bh_shadow_scan
bh_shadow_read
bh_shadow_find
bh_shadow_click
bh_shadow_type
```

### Files

```txt
bh_file_list_downloads
bh_file_read_download
bh_file_download_url
bh_file_download_resource
bh_file_download_batch
bh_file_upload_with_approval
bh_file_open_picker_with_approval
bh_file_save_blob
```

### Documents / PDF

```txt
bh_doc_read_pdf
bh_doc_extract_pdf_pages
bh_doc_detect_scanned_pdf
bh_doc_read_html_document
bh_doc_extract_tables
bh_doc_extract_links
bh_doc_extract_headings
```

### Clipboard

```txt
bh_clipboard_read_with_approval
bh_clipboard_write_with_approval
bh_clipboard_copy_text
bh_clipboard_paste_into_ref
```

### Memory

```txt
bh_memory_lookup
bh_memory_save
bh_memory_update
bh_memory_delete
bh_memory_list
bh_memory_clear_domain
bh_memory_clear_all
bh_memory_explain_hit
```

### Scratchpad

```txt
bh_pad_read
bh_pad_append
bh_pad_replace
bh_pad_clear
bh_pad_compact
```

### Workflow replay

```txt
bh_flow_lookup
bh_flow_preview
bh_flow_run_with_approval
bh_flow_step
bh_flow_stop
bh_flow_save
bh_flow_update
bh_flow_delete
bh_flow_score
```

### Policy

```txt
bh_policy_check_action
bh_policy_request_approval
bh_policy_classify_risk
bh_policy_mask_secrets
bh_policy_explain_block
```

### Adapters

```txt
bh_adapter_detect_site
bh_adapter_get_guidance
bh_adapter_list_workflows
bh_adapter_apply_locator
bh_adapter_report_failure
```

### Trace / eval

```txt
bh_trace_start
bh_trace_record_step
bh_trace_mark_success
bh_trace_mark_failure
bh_trace_export
bh_trace_replay
bh_eval_run_case
bh_eval_label_result
```

## 6. 动态裁剪规则

不要把所有工具每轮都暴露给模型。按 mode 裁剪：

```txt
Ask mode：page/a11y/iframe/viewport read tools，以及低风险 scroll
Act mode：page/a11y/element/nav/viewport/form tools
Debug mode：debug + form + page/iframe/viewport read tools
Form mode：form + page/iframe/element/viewport + policy tools
Vision mode：vision + pointer tools
Advanced mode：tabs/frame/shadow/file/doc/clipboard tools
Memory mode：memory/pad/flow tools
```
