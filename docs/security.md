# Security & Privacy

## Data Flow

BrowserHelm runs in your browser as a Chrome extension. No BrowserHelm-owned backend exists.

**What stays local:**
- Settings and non-secret provider configuration → `chrome.storage.local`.
- Provider API keys → session storage by default; local persistence is only used when a trusted storage policy explicitly enables it.
- Run traces, agent messages, task state → `chrome.storage.local`.
- DOM observation data → processed in-browser; only trimmed summaries sent to provider.

**What is sent to your AI provider:**
- Trimmed/redacted page context (observation summaries, structured form data, visible text excerpts).
- User task text and conversation history.
- Tool results (redacted; field values masked).
- The provider receives only what is needed for the model to make a decision.

**No data is sent to BrowserHelm or any third party.**

## API Key Storage

API keys are session-only by default. BrowserHelm stores the key in `chrome.storage.session` and keeps only non-secret provider settings such as Base URL, model, and persistence mode in `chrome.storage.local`.

Trusted local persistence can be enabled by explicit storage policy opt-in. When enabled, the API key is stored in `chrome.storage.local` (unencrypted on disk), so the UI labels it as trusted local storage rather than the default path.

API keys are:
- Never written to trace/model context.
- Never leaked in debug output (masked as `[MASKED]`).
- Not shared with any service other than your configured provider endpoint.

Future versions may add optional WebCrypto-based encryption.

## Page-Health Hook

BrowserHelm no longer injects the shallow monitoring script by default. In Debug mode, `bh_debug_collect_page_health` can opt in to a temporary page hook (`page-health-hook.js`) that listens for:
- Unhandled console errors
- Network request failures

This hook:
- Does NOT read cookies, password fields, form inputs, or localStorage.
- Does NOT send data anywhere; collected errors are only accessible via `bh_debug_collect_page_health` in Debug run mode.
- Requires a per-install session nonce on page-to-content messages so page-authored forged events are ignored.
- Redacts URL query, path, fragment, and obvious provider secrets before data enters model context.
- Is a shallow fallback when CDP is unavailable or unnecessary; it is not a complete DevTools replacement.

## DevTools / CDP Debugging

v1.3 deep debugging uses Chrome's `debugger` permission. `bh_cdp_attach` attaches to the current tab only when invoked in Debug/Full mode after BrowserHelm approval, then enables CDP Network, Runtime, and Performance collectors.

CDP data handling:
- Request and response headers are redacted by default. `Authorization`, `Cookie`, `Set-Cookie`, token, secret, password, and API key headers are shown as `[MASKED]`.
- URLs, response bodies, console text, and request bodies pass through best-effort redaction/truncation before entering UI, trace, or model context.
- Attach requests are BrowserHelm approval-gated before `chrome.debugger.attach`; attach failure, permission/API unavailability, and response-body unavailability are returned as explicit tool errors.
- Detach with `bh_cdp_detach` when deep inspection is no longer needed.

## Vision / Screenshot Handling

v1.4 screenshot tools are opt-in tool calls for visual ambiguity, overlays, layout issues, canvas/chart-like content, or DOM/a11y fallback. BrowserHelm does not run a screenshot-first loop.

Screenshot data handling:
- Raw screenshot `dataUrl` is never written to trace payloads.
- Persisted snapshot detail masks screenshot `dataUrl` as `[MASKED_IMAGE_DATA]`.
- Vision provider calls receive the screenshot only when a `bh_vision_*` describe/detect tool is explicitly executed and the configured provider supports vision input.
- If vision is unavailable, BrowserHelm returns `VISION_UNAVAILABLE` with `fallback: dom_a11y` and keeps the existing DOM/a11y observation usable.
- `bh_pointer_click` is a last-resort visual fallback. Sensitive coordinate actions such as payment, submit, delete, upload, or password-related clicks return approval required before any click is sent.
- `bh_file_upload_with_approval` records an explicit approval boundary for upload handoff, but does not read local file paths or set file inputs automatically. The user must still choose the file in the browser-controlled picker.

## Advanced Storage Inspection And Mutation

`bh_storage_list` and `bh_storage_get` inspect page `localStorage` / `sessionStorage` only when an advanced storage task is explicit and the current domain has consent. They are read-only and return:
- storage area, key, value length
- short redacted previews for ordinary values
- masked placeholders for token/session/password-like keys

`bh_storage_set_with_approval`, `bh_storage_delete_with_approval`, and `bh_storage_clear_with_approval` are high-risk mutation tools. The initial tool call only creates an approval request; the page storage is not changed until the user approves. Trace and snapshot detail record operation metadata such as area, key, value length, and affected count, but never the raw value being written.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read/write current page on user action |
| `storage` | Save settings, traces, agent state |
| `tabs` | Navigate and manage browser tabs |
| `scripting` | Inject content scripts for page observation |
| `sidePanel` | Open BrowserHelm in Chrome side panel |
| `webNavigation` | Detect page navigations for side panel updates |
| `contextMenus` | Add selection-only explain/translate shortcuts that start read-only Ask runs from user-selected text |
| `debugger` | Attach to the active tab for explicit Debug/Full CDP deep inspection |
| `downloads` | List recent download metadata for v1.5 advanced file tools; BrowserHelm redacts local paths and URL query/fragment before traces/model context |
| `offscreen` | Host the MV3 offscreen clipboard bridge; it is created only for approved clipboard read/write operations |
| `clipboardRead` | Read clipboard text only after explicit BrowserHelm approval; snapshot detail masks clipboard content |
| `clipboardWrite` | Write clipboard text only after explicit BrowserHelm approval; trace stores length/preview metadata, not raw text |
| `optional: <all_urls>` | Request page access on first use (user-granted) |

## Web-Accessible Resources

- `sidepanel.html` — side panel UI
- `page-health-hook.js` — error monitoring injection (see above)
- `icons/*` — floating panel entry icon

## Redaction

BrowserHelm redacts sensitive patterns before sending to the model:
- URLs and email addresses in observation text
- API keys in error messages
- Task text (URL/email patterns)
- Structured data URLs

Redaction is best-effort and should not be treated as cryptographic anonymization.

## Provider Risks

- **Local provider (Ollama, vLLM):** Data stays on your machine with the provider.
- **Cloud provider (DeepSeek, OpenAI, Qwen, etc.):** Trimmed page context is sent to the provider's API endpoint. Review your provider's privacy policy.
- **Custom Base URL:** You control where data is sent. Verify your endpoint's security.

## Reporting

Report security issues via GitHub Issues. Do not include API keys, passwords, or full traces.

## Release Security Gate

v1.6 release readiness 必须把安全边界视为发布阻断，而不是文档 TODO：

- P0 安全项必须在 `docs/audits/v1-1-v1-6-completion-matrix.md` 中标记为 closed。
- 任何 mutating tool、debugger/CDP、clipboard、download/file、storage、workflow replay、iframe/pointer action 都必须经过 execution-layer authorization。
- Approval 请求、pending action、TTL、generation、恢复、拒绝、过期和 runtime audit 必须由 transactional approval coordinator 统一处理。
- 发布前必须运行 `npm run check:release`；该命令会检查 completion matrix 是否存在且没有 P0 open marker。
- 如果 `npm run test:e2e:real` 因 provider credentials 未配置而未运行，最终 release note 必须明确区分未验证项，不得宣称真实模型 E2E 已覆盖。
