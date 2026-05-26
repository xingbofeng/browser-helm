<p align="center">
  <img src="docs/browserhelm-logo.png" alt="BrowserHelm Logo" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-v1.0-blue" alt="Status" />
  <img src="https://img.shields.io/badge/runtime-browser_extension-2ea44f" alt="Runtime" />
  <img src="https://img.shields.io/badge/architecture-local--first-black" alt="Architecture" />
  <img src="https://img.shields.io/badge/agent-a11y--first-6f42c1" alt="Agent" />
  <img src="https://img.shields.io/badge/backend-none-orange" alt="Backend" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="Language" />
  <img src="https://img.shields.io/badge/UI-React-61dafb" alt="UI" />
  <img src="https://img.shields.io/badge/memory-local--first-0969da" alt="Memory" />
  <img src="https://img.shields.io/badge/tools-bh__prefix-black" alt="Tools" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="License" />
</p>

<h1 align="center">BrowserHelm</h1>

<p align="center">
  <strong>Understand the page first, then act safely.</strong><br />
  A local-first AI page assistant that runs in your browser.
</p>

<p align="center">
  <a href="README.md">中文</a>
</p>

---

## What is BrowserHelm?

**BrowserHelm** is a local-first browser AI Agent. It runs as a Chrome extension directly in your browser — it observes pages, diagnoses issues, helps you understand why a form won't submit, and safely executes actions with your approval.

It's not a cloud browser, not a backend automation service, and not a generic Agent SDK with a UI wrapper. BrowserHelm's core is its own Agent Kernel: observe the page → analyze problems → request approval → execute tools → verify results → record trace — every step is transparently shown to you.

## Current Capabilities (v1.0)

BrowserHelm's first shippable version is positioned as a **Page Inspector + Form Doctor**.

**Page Diagnosis** — understand page health at a glance:
- Why is the page throwing errors?
- What console / network anomalies exist?
- Page state overview (title, source, interactive element count)

**Form Doctor** — troubleshoot form issues:
- Which required fields are missing?
- Why is that button disabled?
- Where are the validation errors?
- What's the submit button's association state?

**Safe Execution** — high-risk actions require your approval:
- Submit, send, delete, publish, execute JS are blocked by default
- Approval panel clearly shows what will happen and the risk level
- You decide whether to execute or deny

**Local-First** — your data stays yours:
- Core Agent loop, memory, trace, settings all run locally
- No backend required, no service registration needed
- Future cloud sync is optional enhancement only

**Inspectable & Traceable** — every agent step is visible:
- Message waterfall shows what the agent saw and did
- Trace events fully record the decision process
- Advanced developer panel provides complete diagnostics

## Installation

BrowserHelm is a Chrome extension. Currently available for developer mode manual loading; Chrome Web Store publishing is upcoming.

**Developer mode installation:**

```bash
git clone https://github.com/your-org/browser-helm.git
cd browser-helm
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

**Configure your model:**

BrowserHelm doesn't ship with any model service. On first use:
1. Click the gear icon in the side panel header to open model settings
2. Fill in your existing OpenAI-compatible API details (custom Base URL supported)
3. Click test connection to confirm

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Frontend Debugging** | Open a target page, let BrowserHelm observe and diagnose console / network errors |
| **Form Troubleshooting** | Facing a complex form? Let BrowserHelm find missing required fields and disabled reasons |
| **Page Understanding** | Quickly get a page structure overview: title, source, interactives, form fields |
| **Safe Execution** | When you need to act on a page, safely execute high-risk actions through the approval flow |

## Tech Stack

- **Extension Framework**: [WXT](https://wxt.dev/)
- **UI**: React + [Animal Island UI](https://github.com/guokaigdg/animal-island-ui) (Animal Crossing visual theme)
- **Language**: TypeScript
- **Schema**: Zod
- **Local Storage**: Dexie.js (IndexedDB)
- **State Management**: Zustand
- **Model Layer**: Custom OpenAI-compatible REST client, BYOK

## Roadmap

- **v1.0** — Page Inspector + Form Doctor: first shippable version, read-only diagnosis + safe approval
- **v1.1** — Assisted Form Fill + Frontend Debug
- **v1.2** — Memory + Workflow Replay
- **v1.3** — DevTools/CDP Deep Integration
- **v1.4** — Vision/Screenshot Agent
- **v1.5** — Advanced Browser Tools
- **v1.6** — Domain Adapters
- **v2.0** — Full Browser Agent Platform

## Development

```bash
# Start dev mode
npm run dev

# Type check
npm run typecheck

# Run tests
npm test

# E2E tests
npm run test:e2e

# Extension debugging
npm run debug:extension:watch
```

## License

This project is licensed under the MIT License.

---

<p align="center">
  <sub>Made with ❤️ for people who build on the web</sub>
</p>
