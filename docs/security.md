# Security & Privacy

## Data Flow

BrowserHelm runs in your browser as a Chrome extension. No BrowserHelm-owned backend exists.

**What stays local:**
- Settings, provider configuration, API keys → `chrome.storage.local` (unencrypted; WebCrypto encryption planned).
- Run traces, agent messages, task state → `chrome.storage.local`.
- DOM observation data → processed in-browser; only trimmed summaries sent to provider.

**What is sent to your AI provider:**
- Trimmed/redacted page context (observation summaries, structured form data, visible text excerpts).
- User task text and conversation history.
- Tool results (redacted; field values masked).
- The provider receives only what is needed for the model to make a decision.

**No data is sent to BrowserHelm or any third party.**

## API Key Storage

API keys are stored in `chrome.storage.local` (unencrypted on disk). They are:
- Never written to trace/model context.
- Never leaked in debug output (masked as `[MASKED]`).
- Not shared with any service other than your configured provider endpoint.

Future versions may add optional WebCrypto-based encryption.

## Page-Health Hook

When BrowserHelm's content script activates on a page, it injects a small monitoring script (`page-health-hook.js`) that listens for:
- Unhandled console errors
- Network request failures

This hook:
- Does NOT read cookies, password fields, form inputs, or localStorage.
- Does NOT send data anywhere; collected errors are only accessible via `bh_debug_collect_page_health` in Debug run mode.
- Will become Debug-mode opt-in in a future version.

## Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read/write current page on user action |
| `storage` | Save settings, traces, agent state |
| `tabs` | Navigate and manage browser tabs |
| `scripting` | Inject content scripts for page observation |
| `sidePanel` | Open BrowserHelm in Chrome side panel |
| `webNavigation` | Detect page navigations for side panel updates |
| `optional: <all_urls>` | Request page access on first use (user-granted) |

## Web-Accessible Resources

- `sidepanel.html` — side panel UI
- `page-health-hook.js` — error monitoring injection (see above)
- `assets/*`, `icons/*` — UI assets

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
