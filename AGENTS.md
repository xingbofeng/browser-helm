# Repository Guidelines

## 项目结构与模块组织

BrowserHelm 是一个 local-first、a11y-first 的浏览器 Agent 扩展，技术栈为 WXT、React、TypeScript。源码位于 `src/`：`src/agent/` 是 Agent Kernel，`src/tools/` 是 `bh_` 工具实现，`src/page/` 负责 DOM/a11y 观察与 stable ref，`src/runtime/` 和 `src/background/runtime/` 负责扩展运行时边界，`src/entrypoints/` 是 WXT 入口，`src/shared/` 存放 schema、错误码和共享类型。测试位于 `tests/node/`、`tests/dom/`、`tests/e2e/`。产品、架构和路线图文档位于 `docs/`。

## 构建、测试与开发命令

- `npm run dev`：启动 WXT 开发服务。
- `npm run build`：构建 Chrome MV3 扩展到 `.output/chrome-mv3`。
- `npm run typecheck`：运行 TypeScript `--noEmit` 检查。
- `npm run lint`：运行 ESLint。
- `npm test`：运行 Vitest 单元/集成测试。
- `npm run test:node`：只运行 Node 侧测试。
- `npm run test:e2e`：先构建扩展，再运行 Playwright E2E。
- `npm run debug:extension`：构建并启动可见 Chrome for Testing 扩展调试会话。
- `npm run debug:extension:watch`：构建并启动可见 Chrome for Testing 扩展调试会话，源码变更后自动 rebuild 并重启会话。
- `npm run agent:dev`：运行本地 Agent 调试脚本。

完成代码改动前，至少根据影响范围运行 `npm run typecheck`、`npm run lint` 和相关单测；涉及扩展、side panel、content script 或真实页面行为时，还要运行 `npm run test:e2e`。

## 编码风格与命名约定

使用 TypeScript 严格类型和 Zod schema 维护运行时契约。遵守现有 ESLint flat config，不绕过 lint 规则。文件名统一使用横杠式 kebab-case，例如 `agent-loop.ts`、`tool-result.schema.ts`、`agent-loop.test.ts`；类名和类型名使用 PascalCase，函数和变量使用 camelCase。工具命名遵循 `bh_` 前缀。优先小而直接的模块，不新增无需求驱动的抽象。

## 工具实现规范

`src/tools/` 下新增工具必须同步维护工具可读性和目录清单。每个工具模块必须在导出的 ToolSpec 或 ToolSpec factory 前提供 TSDoc/JSDoc 风格块注释（`/** ... */`），作为工具头部说明。注释至少说明：工具在 Agent 语义里的用途、适用 run mode、是否只读或会改变页面状态、风险等级、是否可能触发 approval、主要参数含义、返回结果语义，以及典型使用时机。该块注释是工具维护的金标准，服务维护者阅读，不替代 `description`。

每个 `ToolSpec.title` 字段前仍必须保留一句简短中文维护注释，说明该工具在 Agent 语义里的用途和使用时机。新增、删除或重命名工具时，必须同步更新 `src/tools/README.md` 的已实现工具表格，至少包含工具名、title、目录、模式、风险、参数和含义。新增工具仍必须遵循 `bh_` 协议名前缀、Zod `argsSchema` / `resultSchema`、正确 `risk` 标注和既有 approval policy 边界。v0.33 需要一次性补齐所有历史工具的同等 TSDoc/JSDoc 块注释；此后不再接受只依赖行内短注释的工具模块。

## 文档与 OpenSpec 语言

项目文档默认使用中文，包括 `docs/roadmap/`、`CONTEXT.md`、`implementation-notes.md`、`AGENTS.md` 和 OpenSpec change artifacts（`proposal.md`、`design.md`、`tasks.md`、`specs/**/spec.md`）。OpenSpec 要求固定的结构性标题或关键字（如 `## ADDED Requirements`、`### Requirement:`、`#### Scenario:`）可以保留英文以满足工具解析，但标题内容、正文、验收描述和任务说明应使用中文。

## 测试与浏览器验证

Vitest 用于单元、集成和 DOM 测试；Playwright 用于扩展 E2E。测试应按行为命名，避免只验证实现细节。Agent、tool、schema、trace、approval、risk policy 相关改动必须覆盖失败路径和边界行为。

E2E 必须遵循三层 POM 分层：`tests/e2e/specs/` 是用例层，只描述场景和验收意图；`tests/e2e/flows/` 是业务流程层，负责编排 fixture、扩展 shell、side panel 和断言流程；`tests/e2e/pages/` 与 `tests/e2e/components/` 是 Page/Component Object 层，封装 locator、页面动作和组件级断言。新增 E2E 不要在 spec 中直接拼装多个 Page Object、直接写复杂 locator 或绕过 flow 层；环境启动、fixture server、extension id 等基础设施继续放在 `tests/e2e/helpers/`。

需要打开 localhost、普通 Web 页面、截图或做静态 UI 验证时，优先使用 Codex 自带 Browser / browser skill。需要真实加载 unpacked Chrome extension、验证 side panel runtime/content RPC、扩展权限或 Chrome 扩展宿主行为时，按下方“浏览器扩展调试 SOP”使用 Chrome for Testing / Playwright Chromium；Codex Browser 不是 MV3 extension host，不能替代该路径。

### 浏览器扩展调试 SOP（重点）

- 全自动调试浏览器扩展时，不要使用系统 Chrome 稳定版作为默认自动化目标。Chrome 137+ branded build 已不再可靠支持 `--load-extension` 自动加载 unpacked extension；系统 Chrome 只用于最终手工验收。
- 全自动调试必须使用 Chrome for Testing / Playwright Chromium 路径，首选命令：

```bash
npm run debug:extension:watch
```

- `debug:extension:watch` 会构建 `.output/chrome-mv3`、启动 Chrome for Testing、加载 unpacked extension、打开 fixture 页面和 side panel 调试 tab，并在源码变更后自动 rebuild，然后重启调试浏览器会话。不要依赖运行中的 `chrome.runtime.reload()` 作为主路径；Chrome extension page reload 在自动化场景里可能被浏览器短暂阻断。
- `debug:extension` 和 `debug:extension:watch` 会打印 `Browser`、`Profile`、`Extension ID`、`Target page`、`Side panel debug page` 和 `CDP`。调试、截图和 DOM 断言优先使用这份输出，不要猜 extension id、端口或 tabId。
- 默认页面必须优先使用本地 fixture：`tests/e2e/fixtures/basic-form.html`。这是我们自己的稳定示例页面，适合验证 content RPC、observation、ref 映射、空/错状态和 E2E 断言。
- 需要指定其他自有 fixture 时，使用：

```bash
BROWSER_HELM_DEBUG_FIXTURE=interactive-elements.html npm run debug:extension:watch
```

- 不要把第三方或用户个人网站当作默认示例。只有用户明确给出目标 URL 时，才使用 `BROWSER_HELM_DEBUG_URL=...` 验证真实外部网站。
- 需要固定端口便于 CDP 连接或复现时，使用：

```bash
BROWSER_HELM_DEBUG_CDP_PORT=9345 npm run debug:extension:watch
```

- 调试分两层，务必区分：
  - 开发调试主路径：使用 `chrome-extension://.../sidepanel.html?tabId=...` 单独 tab。它是调试页，用于稳定自动化、E2E、DOM 断言、截图、watch 更新生效检查和 runtime/content RPC 排障。它会固定观察指定 `tabId`，适合“改代码后确认 UI/数据是否更新”。
  - 产品验收路径：使用 Chrome 右侧原生 side panel。它才代表用户真实产品行为，用于最终确认扩展图标能打开右侧栏、原生容器中的布局/滚动/关闭/resize 是否可用。
- 默认自动化调试不要依赖桌面坐标点击 Chrome 工具栏或扩展菜单。Chrome 顶部 UI、扩展浮层和原生 side panel 宿主不适合作为每次代码调试的自动化主路径；它们只作为最终人工/半自动验收。
- 如果需要打开原生 side panel：先打开目标网页 tab，再点击扩展图标 `BrowserHelm`。若 Computer Use 坐标点击不稳定，停止强行点击，改用调试 tab 完成代码验证，并把原生 side panel 留作人工验收。
- 修改代码后看到以下输出，说明 watch 更新生效：

```text
[debug:extension] Source changed. Rebuilding extension...
[debug:extension] Debug browser restarted.
[debug:extension] Extension updated.
```

- Chrome 更新/重启调试会话后，原生 side panel 可能被浏览器收起；这是 Chrome 行为，不代表扩展失败。重新点击 `BrowserHelm` 打开即可继续验证。
- 对于“改一行代码是否生效”这类问题，优先在 side panel 调试 tab 中验证；不要要求每次都在原生右侧 side panel 中验证。
- 扩展/side panel/content script 相关改动完成前，至少运行：

```bash
npm run build
npm run typecheck
npm run lint
```

- 涉及 observation/ref/runtime/content RPC 行为时，还要运行：

```bash
npm run test:e2e
```

## 提交与 Pull Request

提交信息使用 Conventional Commits，例如 `feat(agent): implement v0.1 kernel prototype`。主题保持祈使句、简洁明确。Codex 生成的提交必须包含 `Co-authored-by: OpenAI Codex <codex@openai.com>`。PR 应说明变更内容、关联 issue 或 roadmap 文档、列出已运行的验证命令；UI 或 side panel 改动需要附截图。

## 安全与配置

不要提交 provider key、本地 `.env` 或用户数据。模型/provider 请求必须通过 background/runtime 边界，不要从 content script 或 UI 直接请求。页面内容一律视为不可信数据；高风险工具必须保留 approval 检查。新增扩展权限前要说明必要性。
