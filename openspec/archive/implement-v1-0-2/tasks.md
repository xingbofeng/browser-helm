## 1. Schemas And Tool Contracts

- [x] 1.1 Define page read result schema with text, cursor, nextCursor, hasMore, totalTextLength, and warnings.
- [x] 1.2 Define viewport info and scroll result schemas for top page and iframe targets.
- [x] 1.3 Define iframe list/read schemas with iframeId, content modes, links, scroll state, and limitations.
- [x] 1.4 Add tool name constants and ToolSpec metadata for page, iframe, viewport, element, nav, debug, and policy tools.

## 2. Page And Iframe Reading

- [x] 2.1 Implement `bh_page_read_visible_text` with cursor/maxChars pagination.
- [x] 2.2 Implement `bh_page_read_article` with article/main/role main extraction and optional headings/links.
- [x] 2.3 Implement `bh_page_wait_until_stable` for document ready and mutation quiet.
- [x] 2.4 Implement `bh_iframe_list` and replace frame naming in Agent-visible semantics.
- [x] 2.5 Implement `bh_iframe_read` for summary, visible_text, article, cursor, links, and iframe viewport state.
- [x] 2.6 Return structured limitation for inaccessible/cross-origin iframe content.

## 3. Viewport And Element Actions

- [x] 3.1 Implement `bh_viewport_get_info` for page and iframe contexts.
- [x] 3.2 Implement `bh_viewport_scroll` for page and iframe targets with changedPage and requiresObserve.
- [x] 3.3 Remove old `bh_iframe_click` and `bh_iframe_type` exposure.
- [x] 3.4 Implement iframe-aware `bh_element_click` and `bh_element_type_text`.
- [x] 3.5 Implement `bh_element_get_computed_style` and `bh_element_focus`.

## 4. Nav, Debug, Policy Tools

- [x] 4.1 Implement `bh_nav_open_url`, `bh_nav_reload`, `bh_nav_back`, and `bh_nav_forward`.
- [x] 4.2 Implement `bh_debug_get_console_errors`, `bh_debug_get_network_failures`, and `bh_debug_explain_error`.
- [x] 4.3 Implement `bh_policy_mask_secrets`.
- [x] 4.4 Update tool README and required tool header comments.

## 5. AgentLoop And Runtime

- [x] 5.1 Update `bh_page_observe` warnings/nextHints for visible text truncation and continuation reads.
- [x] 5.2 Update ToolSelector / mode gate for page read, iframe read, viewport scroll, element/nav/debug/policy tools.
- [x] 5.3 Update system prompt so truncated content, hasMore, or scrollable iframe states drive additional reads.
- [x] 5.4 Move side panel user tasks onto AgentLoop tool-calling rather than snapshot-only provider answer.
- [x] 5.5 Define tool-calling phase and final streaming answer phase boundary.
- [x] 5.6 Restrict RuntimeDiagnosticModelClient to internal diagnostic fallback.
- [x] 5.7 Update RunSnapshot messages for long page reads, iframe reads, scroll, wait, and limitations.
- [x] 5.8 Update trace with cursor, hasMore, scroll before/after, iframeId, frameId, changedPage, and requiresObserve.

## 6. Tests And E2E

- [x] 6.1 Add DOM tests for long visible text pagination, article extraction, hidden text filtering, and cursor boundaries.
- [x] 6.2 Add runtime/tool tests for viewport info, scroll result, iframe read, mode gate, and requiresObserve.
- [x] 6.3 Add E2E fixtures for long pages, lazy-load pages, scrollable iframes, iframe read, and iframe element action migration.
- [x] 6.4 Verify top page long read, iframe read, iframe scroll, and final answer through Chrome for Testing SOP.
