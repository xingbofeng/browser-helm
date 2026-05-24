## [实现 v0.1 Agent Kernel（OpenSpec）] - [2026-05-24]

**目标**：严格按 `docs/roadmap/v0.1-agent-kernel.md` 与 OpenSpec 变更 `implement-v0-1-agent-kernel` 完成 0.1 版本开发，包含 schema/runtime/tool/trace/dev script 与分层测试。

**设计决策**：选择 “trace 保留完整 ToolResult + 上下文只注入压缩摘要”，而非将 `ToolResult.data` 直接拼接给模型。原因：满足 AC10/AC11，降低上下文爆炸与敏感数据泄露风险。

**偏差说明**：原目录结构关注 `src/**` 与 `tests/**`；实际额外修改了 `package.json`、`tsconfig.json`、`eslint.config.js`、`wxt.config.ts` 与 `src/wxt-globals.d.ts`。原因：保证 Node-only 测试、TypeScript 与 lint 质量门禁可稳定通过（AC15/AC16）。

**权衡分析**：
- 方案一：只做最小 runtime 代码，不调整工程配置。优点：改动面小；缺点：测试与类型门禁不稳定，难以证明 AC13/AC15。
- 方案二：补齐必要工程配置并保持最小范围。优点：质量门禁可重复验证；缺点：出现少量目录外偏离。
- 选择方案二，因为：目标要求“严格遵守 eslint 和 ts 规范 + 全量验收可证明”，需要可执行的工程化收口。

**待确认**：
- [ ] 是否按你的预期保留了 `.env` fallback 行为（dev 脚本优先环境变量，缺失时回退 `.env`）？
- [ ] `ContextCompactor` 对 `context.visibility=hidden/summary/full` 的当前策略是否符合你期望的 0.1 粒度？

## [补齐 v0.1 Agent Kernel Review 缺口] - [2026-05-24]

**目标**：根据逐项 review 结果补齐 runtime 语义缺口，确保工具 contract 进入模型上下文、模型错误不穿透 runtime、trace 使用真实工具元信息，并补上 LoopSession/StateMachine/StepRunner 的最小实现。

**设计决策**：选择让 `ToolRouter` 暴露 `ToolPromptContract` 与单工具 metadata，而非让 `AgentLoop` 直接依赖 `ToolRegistry`。原因：保持 agent runtime 通过 router 边界读取工具能力，避免绕开工具层。

**偏差说明**：`StepRunner` 当前只承担 step frame 创建，不拆出完整 step 执行编排。原因：v0.1 仍是单 loop 原型，完整拆分会引入不必要抽象；但文件与职责已存在，后续可以逐步迁移模型调用、parser、tool 执行。

**权衡分析**：
- 方案一：只在 prompt 里塞工具名。优点：改动小；缺点：模型不知道 args schema、risk、modes，仍容易产出不合格 tool_call。
- 方案二：从 ToolSpec 生成 prompt contract，包含 description、risk、modes、args schema。优点：更符合 REACT tool_call 约束；缺点：prompt 更长，Zod JSON schema 仍是 v0.1 级别表达。
- 选择方案二，因为：当前问题的根因是模型上下文缺少工具契约，必须让 tool_call 有足够结构信息。

**待确认**：
- [ ] `ToolPromptContract` 的 args schema 粒度是否满足 0.1，还是需要后续做专门的 tool prompt formatter？
- [ ] `StepRunner` 是否保持当前轻量形态，还是下一步把单 step 执行逻辑从 `AgentLoop` 里拆出来？

## [修复 v0.1 Review 阻断项] - [2026-05-24]

**目标**：修复 review 中发现的 0.1 完成度缺口：WXT build 入口目录、high-risk 工具审批阻断、`bh_agent_finish` / `bh_agent_ask_user` 内部工具语义。

**设计决策**：选择在 `AgentLoop` 执行工具前依据 `ToolSpec.risk` 调用 `ApprovalPolicy`，对 high-risk 工具生成 `APPROVAL_REQUIRED` ToolResult 并写入 trace，而不是先执行工具再依赖工具自行返回 approval。原因：高风险动作必须不能绕过 runtime policy。

**偏差说明**：额外调整了 `wxt.config.ts` 的 `srcDir: 'src'`。原因：项目入口实际位于 `src/entrypoints`，默认 WXT 会查找根目录 `entrypoints`，导致 `npm run build` 失败。

**权衡分析**：
- 方案一：只要求 high-risk mock tool 自己返回 `requiresApproval`。优点：改动小；缺点：工具实现可绕过审批策略。
- 方案二：runtime 在工具执行前统一按 risk 阻断。优点：审批边界集中且可验证；缺点：后续需要完整 approval approve/deny 编排时再补 resume 后执行路径。
- 选择方案二，因为：v0.1 的目标是协议和 trace 层先保证高风险动作不能绕过 policy。

**待确认**：
- [ ] 后续 approval approve 后是否重新执行原 tool_call，还是把 approval 作为独立 continuation step？
- [ ] `bh_agent_fail` 是否需要像 `bh_agent_finish` / `bh_agent_ask_user` 一样增加专门的 terminal 分支，还是继续沿用现有 failed ToolResult 路径？

## [实现 v0.2 Page Observation + Ref Prototype] - [2026-05-24]

**目标**：按 `docs/roadmap/v0.2-page-observation.md` 与 OpenSpec 变更 `implement-v0-2-page-observation` 建立真实只读页面观察能力，包含 observation schema、a11y-like snapshot、stable ref、content RPC、真实 page/a11y tools、runtime/provider 分层边界、side panel 只读 MVP 和 POM E2E。

**设计决策**：选择 background/service worker 作为 DeepSeek/OpenAI-compatible provider 请求边界，UI 只能通过 `RuntimePort`，content script 只处理 DOM/a11y/ref observation。原因：浏览器插件里 provider 请求同时涉及 host permissions、CORS、API key、trace masking 和 prompt injection，必须集中在 extension runtime 控制。

**偏差说明**：真实 Chrome side panel 人工交互、扩展权限 UI 和像素级设计稿一致性不作为本次自动化通过标准；实际使用 Playwright/Chromium 自动加载 unpacked extension 验证 content script、background/content RPC、sidepanel extension page 和核心链路，并生成 `test-results/v0.2-sidepanel.png` 供后续人工视觉对照。原因：用户明确当前不在电脑前，真实浏览器人工步骤作为环境门控，不伪造通过。

**权衡分析**：
- 方案一：让 side panel 或 content script 直接请求 provider。优点：实现短；缺点：CORS/host permission/key 泄露边界混乱，页面内容更容易诱导 endpoint 注入。
- 方案二：补齐 `src/runtime/**`、`src/background/runtime/**`、`src/storage/chrome/**` 边界，由 background 装配 provider client。优点：符合架构分层和安全边界；缺点：v0.2 增加少量 runtime 骨架。
- 选择方案二，因为：0.2 第一次打通真实浏览器层，如果不把 provider 边界固定，后续 UI/content 实现会很容易越层。

**验证记录**：
- 真实调用：`npm run build` 成功生成 `.output/chrome-mv3`；Playwright/Chromium 成功加载本地 unpacked extension。
- 自动化 E2E：`npm run test:e2e` 通过 5 个 POM 用例，覆盖 observe basic form、render ref mapping、handle stale ref、handle content unavailable、keep prompt injection as data。
- mock/静态检查：`npm run typecheck`、`npm run lint`、`npm test` 均通过。
- 手工检查：未执行人工 Chrome side panel 权限 UI 检查。
- 环境门控未验证：真实 Chrome 侧边栏入口、扩展权限确认弹窗、与两张设计稿的人工视觉对照。

**待确认**：
- [ ] 后续是否将 `<all_urls>` 收窄为 optional host permissions，并为 DeepSeek/OpenAI-compatible endpoint 做单独授权 UI？
- [ ] v0.3 是否把当前 side panel 静态展示改为 trace-driven runtime state？

## [修复 v0.2 Review 缺口] - [2026-05-24]

**目标**：根据 0.2 验收 review 结论补齐真实 runtime 和 side panel 链路，避免只靠静态 mock 或绕过 ToolRouter 的 E2E 证明完成度。

**设计决策**：选择让 side panel 通过 `ExtensionRuntimePort` 调 background runtime，再由 `RunManager` 装配 `ToolRegistry` / `ToolRouter` 和真实 page/a11y tools 执行 `bh_page_observe`。原因：这能复用已有工具 contract、args/result schema 校验和 content RPC 错误结构，而不是在 UI 或测试里直接调用 content script。

**偏差说明**：E2E 中直接打开 `sidepanel.html` 时不具备真实 Chrome side panel 的关联 tab 上下文，因此测试用 `?tabId=` 显式传入 fixture tab。真实 side panel 默认仍通过 active tab 查询。原因：无人值守 Chromium 扩展页和真实 side panel 宿主行为不同，测试需要稳定目标 tab。

**权衡分析**：
- 方案一：保留静态 side panel，只增强 content RPC E2E。优点：改动小；缺点：无法满足 UI 复用 observation/ref/error 的验收标准。
- 方案二：在 v0.2 内补最小 runtime snapshot，把 observation/ref/tool result/error 暴露给 UI。优点：验收链路真实且后续可接 trace-driven state；缺点：当前仍是一次 observe 的只读 snapshot，不是完整 agent run。
- 选择方案二，因为：v0.2 的风险点是“看见页面”的真实产品链路，必须让 UI、runtime、ToolRouter、content script 连起来。

**待确认**：
- [ ] v0.3 是否将 `RunSnapshot` 拆成独立 runtime state schema，并把 trace events 纳入 side panel？
- [ ] 真实 Chrome side panel 是否需要通过 `chrome.sidePanel` 关联 tab API 获取 tabId，而不是 active tab fallback？

## [v0.2 文件命名收口（局部）] - [2026-05-24]

**目标**：在不做全量重命名的前提下，先把 v0.2 新增文件和最近触碰文件中的 `PascalCase` 文件名，统一成 kebab-case，降低大小写敏感平台的后续风险。

**设计决策**：优先重命名 `Runtime`/`SettingsStore`/E2E 页面对象的新文件与新增文件路径，保持类名与接口名不变。原因：类名仍保留语义清晰度，文件名符合跨平台统一约定，且改动面可控。

**偏差说明**：未做全量收敛（如 `MemoryStore.ts`、既有 `agent` 模块的大量 PascalCase 文件）。原因：与当前变更目标一致，优先避免一次性全仓库改名引发 review 噪音。

**权衡分析**：
- 方案一：一次性重命名所有 PascalCase 文件。优点：命名完全统一；缺点：改动巨大且容易影响历史 diff 阅读。
- 方案二：按“v0.2 新增 + 最近改动”分批收口。优点：风险低、可逐步合并；缺点：短期内仍会有历史遗留混用。
- 选择方案二，因为：当前最小化变更原则与可维护性优先。

**待确认**：
- [ ] 是否进入下一批（例如 `src/storage/interfaces/MemoryStore.ts`、`src/shared/schemas/agentDecision.schema.ts`）继续统一命名？

## [全仓库文件横杠化（横杠式命名全量推进）] - [2026-05-24]

**目标**：将仓库内可见非工具目录、非第三方文件统一为 kebab-case（含 `src/`、`tests/`、`scripts/`、`docs/` 的文件名与对应引用），避免跨平台大小写路径问题。

**设计决策**：采用“文件名仅变更，不改类名/导出符号”的方式重命名；通过 Git 重命名保留历史，并批量补齐导入路径。原因：不牺牲语义 API 的同时，尽快让文件系统命名规范稳定。

**偏差说明**：`App.tsx`/`main.tsx` 原有框架入口语义文件不再保留大写；本次也按同一规则统一改为 `app.tsx`（侧边栏入口）。`README` 同样改为 `readme.md`，便于规范一致。

**权衡分析**：
- 方案一：仅重命名新增/新碰文件。优点：风险小；缺点：历史遗留仍破坏规则完整性。
- 方案二：在可控范围内全面重命名并同步引用。优点：一次性达到“所有文件”目标；缺点：重命名量大，需额外验证链路。
- 选择方案二，因为用户目标是“所有文件横杠命名”。

**执行结果**：
- 已通过 `typecheck`、`lint`、`test`、`build`，且未发现旧路径残留引用。
- 发现并一次性修复了 `scripts/run-agent-dev.ts` 的路径引用。

**待确认**：
- [ ] 是否将隐藏工具目录（如 `.codex`/`.claude`）也纳入同规格名策略？当前实现已排除外部工具元信息目录。

## [E2E 三层 POM 分层重构] - [2026-05-24]

**目标**：将扩展 E2E 按三层 POM 分层重构，并把该分层写入 `AGENTS.md` 作为后续标准。

**设计决策**：选择 `specs/` 作为用例层、`flows/` 作为业务流程层、`pages/` 与 `components/` 作为 Page/Component Object 层，而不是继续把 flow 编排和 panel 断言混在 spec 或 `pages/` 下。原因：spec 应只表达行为场景，流程编排和 locator/断言细节需要稳定边界，降低后续 E2E 修改成本。

**偏差说明**：`tests/e2e/extension` 实际迁移为 `tests/e2e/specs/extension`，并同步修改 `playwright.config.ts` 的 `testDir`。原因：目录名需要体现用例层语义，同时保持 Playwright 发现测试的入口明确。

**权衡分析**：
- 方案一：只移动 panel object 到 `components/`。优点：改动小；缺点：spec 仍直接拼装多个对象，不符合三层 POM。
- 方案二：新增 flow 层并让 spec 只调用 flow。优点：分层清晰、可复用业务流程；缺点：多一层文件，需要维护 flow 命名边界。
- 选择方案二，因为：用户明确要求按三层 POM 重构并沉淀为标准。

**待确认**：
- [ ] 后续是否需要把 E2E flow 再抽成 Playwright fixture，进一步减少每个 spec 的 `try/finally`？
- [ ] `components/side-panel/` 是否需要继续细分 tab、trace、observation 等更小组件对象？

## [真实 Agent Dev 调试脚本] - [2026-05-24]

**目标**：将 `npm run agent:dev` 从 mock harness 改为真实 provider、真实扩展页面数据和真实 page/a11y 工具链路，并收口内部 agent 工具文件命名。

**设计决策**：选择让脚本先构建 `.output/chrome-mv3`，再通过 Playwright Chromium 加载 unpacked extension，最后由 service worker 调 `chrome.tabs.sendMessage` 访问 content script，而不是在 Node 环境里伪造 page observe 结果。原因：真实页面观察能力只能通过扩展 runtime/content script 边界拿到，Node 侧直接调用无法代表实际浏览器环境。

**偏差说明**：`bh_agent_finish` / `bh_agent_fail` / `bh_agent_ask_user` 的 tool protocol name 仍保留下划线。原因：这是模型工具协议名和既有 trace/schema 契约；本次“横杠隔离”落实到文件与模块命名，迁移为 `src/tools/agent/bh-agent-*.ts`。

**权衡分析**：
- 方案一：保留 `MockModelClient` fallback，仅把 mock 工具换成真实工具。优点：无 provider 也能跑；缺点：仍会掩盖真实模型输出和真实浏览器链路问题。
- 方案二：没有 provider 配置就失败，并要求脚本只跑真实模型与真实工具。优点：调试输出可信；缺点：本地必须配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`。
- 选择方案二，因为：用户明确要求不能用 mock，要用真实数据。

**验证记录**：
- 真实调用：`npm run agent:dev -- "Observe current page and finish"` 已调用真实 provider `deepseek-v4-flash` / `https://api.deepseek.com`，打开 `https://example.com`，执行真实 `bh_page_observe`，trace 中返回 `Example Domain`、页面文本和 `ref_101` link。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- 自动化测试：`npm run test:node` 通过 43 个文件 / 100 个测试；`npm run test:e2e` 通过 5 个真实扩展 E2E。

**待确认**：
- [ ] 是否把默认 `BROWSER_HELM_AGENT_URL` 从 `https://example.com` 改成必须显式传入，避免误把示例站当目标页面？
- [ ] 是否需要把 `debug:extension` 和 `agent:dev` 的 Chromium 启动逻辑抽成共享 helper？

## [删除生产 Mock Tools 目录] - [2026-05-24]

**目标**：删除 `src/tools/mock/`，避免生产源码继续暴露 mock tool，并保留 Node 测试所需的隔离 fixture。

**设计决策**：选择将 `bh_mock_page_observe`、`bh_mock_form_list`、`bh_mock_debug_errors` 迁移到 `tests/helpers/tools/`，而不是直接删除所有 mock fixture。原因：AgentLoop、ToolRouter、schema 和 context 单测仍需要可预测工具结果；这些 fixture 属于测试基础设施，不应放在生产工具目录。

**偏差说明**：tool protocol name 仍保留 `bh_mock_*`。原因：这是测试里刻意验证 parser、prompt、trace 的工具名字符串，不属于文件命名规范；文件名已改为横杠式 `bh-mock-*.ts`。

**权衡分析**：
- 方案一：直接删除 mock tools 和对应测试。优点：代码更少；缺点：丢失 Agent Kernel 的隔离测试覆盖。
- 方案二：迁移到 `tests/helpers/tools/` 并更新测试导入。优点：生产源码干净，同时保留低成本单测；缺点：测试目录仍存在 mock fixture。
- 选择方案二，因为：当前目标是生产链路不用 mock，不是删除测试替身能力。

**验证记录**：
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- 自动化测试：`npm run test:node` 通过 43 个文件 / 100 个测试；`npm run test:e2e` 通过 5 个真实扩展 E2E。

**待确认**：
- [ ] 是否后续把测试名目录 `tests/node/tools/mock/` 也改成 `tests/node/helpers/tools/` 或 `tests/node/test-tools/`，让“mock”只出现在 fixture 名称里？

## [E2E 默认 Headless 运行] - [2026-05-24]

**目标**：让 `npm run test:e2e` 默认使用 headless Chromium，不再打开可见测试浏览器窗口。

**设计决策**：选择在 headless E2E 中使用 `channel: 'chromium'`，并保留 `BROWSER_HELM_E2E_HEADLESS=0` 作为临时 headed 调试开关。原因：Playwright 默认 headless shell 路径无法加载 MV3 extension service worker，导致测试等待 extension id 超时；Chromium 新 headless 通道可以加载 unpacked extension。

**偏差说明**：`debug:extension` 和 `agent:dev` 仍保持可见浏览器，因为它们是交互/调试入口，不是 CI 风格 E2E。原因：调试脚本需要观察页面、DevTools 和 extension 状态。

**权衡分析**：
- 方案一：直接把 `headless` 改成 `true`。优点：最简单；缺点：实际验证会超时，扩展 service worker 起不来。
- 方案二：headless 时指定 `channel: 'chromium'`。优点：满足 headless 自动化并保留 MV3 extension 能力；缺点：启动配置比普通 Playwright 测试多一个 extension 专用约束。
- 选择方案二，因为：E2E 必须同时满足 headless 和真实扩展加载。

**验证记录**：
- 自动化测试：`npm run test:e2e` 在默认 headless 下通过 5 个真实扩展 E2E。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。

**待确认**：
- [ ] 是否需要给 `debug:extension` 也增加类似 `BROWSER_HELM_DEBUG_HEADLESS=1` 的可选无头模式？

## [Agent Dev 默认 Headless] - [2026-05-24]

**目标**：避免 `npm run agent:dev` 在日常调试真实 Agent 链路时默认打开可见 Chromium 窗口。

**设计决策**：选择让 `agent:dev` 与 E2E 一样默认 headless，并在 headless 时使用 `channel: 'chromium'` 保持 MV3 extension 可加载；通过 `BROWSER_HELM_AGENT_HEADLESS=0` 保留可见窗口调试。原因：真实 Agent 调试仍需要加载 unpacked extension，但默认不应打断开发者桌面。

**偏差说明**：`debug:extension` 仍保持 headed。原因：它的定位是交互式扩展调试入口，需要打开页面、side panel 和可选 DevTools。

**权衡分析**：
- 方案一：只让 E2E headless，保留 `agent:dev` headed。优点：肉眼可观察真实页面；缺点：用户运行脚本时仍会看到浏览器窗口。
- 方案二：`agent:dev` 默认 headless，显式 env 才 headed。优点：默认行为安静，仍保留调试开关；缺点：需要通过 trace 判断页面状态。
- 选择方案二，因为：用户反馈当前仍会打开窗口，默认脚本应避免可见浏览器。

**验证记录**：
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- E2E 启动确认：`DEBUG=pw:browser npx playwright test tests/e2e/specs/extension/content-unavailable.spec.ts --reporter=list` 显示 Chromium 启动参数包含 `--headless`，单测通过。

**待确认**：
- [ ] 是否也要把 `debug:extension` 改成默认 headless，只用 `BROWSER_HELM_DEBUG_HEADLESS=0` 打开窗口？

## [修复扩展 UI 入口 HTML 构建结构] - [2026-05-24]

**目标**：使用 Codex 内置 Browser 验证 side panel UI 时，修复构建产物 HTML 结构异常导致样式未正确呈现的问题，并同步收口 popup/options 同类入口。

**设计决策**：选择为 `sidepanel`、`popup`、`options` 三个入口补齐标准 `<!doctype html>`、`html/head/body`、`meta charset`、`viewport` 和 title，而不是只修 sidepanel。原因：三个入口共享同样的一行 root/script 模板，WXT 构建会把注入的 head 资源放进错误位置，属于同类 UI 入口缺陷。

**偏差说明**：本次验证使用 Codex 内置 Browser 打开本地 HTTP 静态构建产物，不能模拟 Chrome 扩展宿主的 `chrome.runtime`。原因：内置 Browser 不是 MV3 extension host，不能加载 unpacked extension；因此 runtime messaging 链路仍需在 Chrome/Chromium extension 环境验证。

**权衡分析**：
- 方案一：只记录内置 Browser 无法跑扩展 runtime。优点：零代码改动；缺点：会遗漏真实 HTML 构建结构问题，UI 样式在普通本地页面下裸奔。
- 方案二：修复所有扩展 UI 入口 HTML，再用内置 Browser 验证静态 UI 和错误状态。优点：改动小且消除共同入口缺陷；缺点：仍不能覆盖真实 `chrome.runtime` 观察链路。
- 选择方案二，因为：用户要求用自带浏览器验证 UI 层，当前环境能可靠证明 UI 渲染与非扩展宿主错误态，真实扩展 runtime 边界需单独说明。

**验证记录**：
- 真实调用：`npm run build` 成功，`.output/chrome-mv3/sidepanel.html` 已生成标准 HTML 结构。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- UI 验证：Codex 内置 Browser 打开 `http://127.0.0.1:<local>/sidepanel.html`，确认 BrowserHelm v0.2、页面观察、Ref 映射、交互元素、表单字段、卡片布局和样式生效。
- 环境边界：内置 Browser 中点击发送任务后按预期显示 `Chrome runtime messaging is unavailable`，未验证真实 Chrome extension side panel 的 content RPC。

**待确认**：
- [ ] 是否下一步用真实 Chrome/Chromium extension host 跑完整 content RPC + side panel 观察链路？

## [修复 Chrome action 打开 Side Panel 行为] - [2026-05-24]

**目标**：让 BrowserHelm 安装为 Chrome 扩展后，通过工具栏扩展按钮打开右侧 side panel，而不是打开 popup 或只能直接访问 `sidepanel.html`。

**设计决策**：移除 popup 入口，并在 manifest action 中只保留标题；background 启动时调用 `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`。原因：Chrome action 如果配置了 `default_popup` 会优先打开 popup，无法作为 side panel 入口；side panel 应由 `side_panel.default_path` 和 action click 行为共同驱动。

**偏差说明**：已用系统 Chrome 148 启动独立临时 profile 验证命令行参数，但 branded Chrome 148 不再通过 `--load-extension` / `--disable-extensions-except` 加载 unpacked 扩展，因此“方案 2 自动加载扩展”无法在系统 Chrome 中完成。原因：Chrome 137+ 已移除官方 Chrome branded build 的该命令行加载能力，手工 `chrome://extensions` 的 Load unpacked 仍是系统 Chrome 可用路径。

**权衡分析**：
- 方案一：保留 popup，同时在 popup 内提供打开 side panel 的按钮。优点：兼容旧入口；缺点：用户点击扩展图标仍先看到 popup，不符合侧边栏产品形态。
- 方案二：删除 popup 入口，让 action click 直接交给 `chrome.sidePanel` 行为。优点：安装后入口清晰，符合 Chrome side panel 扩展模型；缺点：需要用户在真实 Chrome 里重新加载 unpacked 扩展后点击工具栏按钮验证。
- 选择方案二，因为：当前需求明确是“应该出现在浏览器侧边栏”，不应再保留会抢占 action click 的 popup。

**验证记录**：
- 真实调用：`npm run build` 成功，产物 manifest 包含 `side_panel.default_path = "sidepanel.html"`，action 不再包含 `default_popup`。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- 系统 Chrome 验证：Chrome 148.0.7778.179 可用独立 profile 和 DevTools 端口启动，但不会通过 `--load-extension` 加载 unpacked BrowserHelm；补测 `--disable-features=DisableLoadExtensionCommandLineSwitch` 也未生效。
- 环境边界：真实 side panel 的工具栏点击打开行为仍需在手工 Load unpacked / Reload 后验证，或改用 Chrome for Testing/Chromium 做自动化验证。

**待确认**：
- [ ] 是否接受后续自动化验证改用 Chrome for Testing/Chromium？
- [ ] 是否需要为系统 Chrome 手工调试保留一份简短 reload/checklist？

## [新增 Chrome for Testing 扩展调试入口] - [2026-05-24]

**目标**：提供一条可全自动加载 unpacked extension 的本地调试命令，绕开系统 Chrome 148 不再支持 `--load-extension` 的限制。

**设计决策**：新增 `npm run debug:extension`，先执行 `wxt build`，再用 Playwright 管理的 Chrome for Testing 启动独立 persistent profile、加载 `.output/chrome-mv3`、启动 fixture server、打开目标页面并打开带 `tabId` 的 side panel 调试页。原因：Chrome for Testing 是自动化场景的一等浏览器，仍可通过命令行加载 unpacked extension；带 `tabId` 的 side panel 页面也复用现有 E2E runtime/content RPC 链路。

**偏差说明**：脚本默认打开 `chrome-extension://.../sidepanel.html?tabId=...` 作为可检查调试页，而不是强制自动点击浏览器工具栏 action。原因：Playwright/DevTools 对 Chrome 顶部工具栏和真实 side panel host 的自动化能力有限；产品行为仍由 manifest `side_panel` + background `setPanelBehavior` 驱动，工具栏点击可在打开的 Chrome for Testing 窗口内手工复核。

**权衡分析**：
- 方案一：继续尝试系统 Chrome `--load-extension`。优点：最接近用户日常浏览器；缺点：Chrome 148 已验证不加载 unpacked extension，无法稳定自动化。
- 方案二：新增 Chrome for Testing 调试脚本。优点：可全自动加载扩展、拿到 extension id、打开 fixture/sidepanel、暴露 CDP 端口；缺点：不是用户日常 Chrome profile。
- 选择方案二，因为：用户目标是全自动调试，稳定自动加载 extension 比复用日常 Chrome profile 更关键。

**验证记录**：
- 真实调用：`BROWSER_HELM_DEBUG_EXIT_AFTER_READY=1 npm run debug:extension` 成功启动 Chrome for Testing，加载 `.output/chrome-mv3`，打印 extension id、fixture URL、side panel debug URL 和 CDP 地址。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- 环境边界：未保持交互调试浏览器常驻；验证用 `BROWSER_HELM_DEBUG_EXIT_AFTER_READY=1` 在 ready 后自动关闭。

**待确认**：
- [ ] 是否需要下一步把真实 side panel host 的手工点击检查写成 `debug:extension` 启动后的 checklist？
- [ ] 是否需要为外部 URL 调试约定 `BROWSER_HELM_DEBUG_URL` 的常用示例？

## [新增扩展调试 Watch Reload] - [2026-05-24]

**目标**：让 Chrome for Testing 调试实例在源码更新后自动重建并 reload 扩展，减少每次修改后手工重新加载 side panel 的成本。

**设计决策**：新增 `npm run debug:extension:watch`，通过轮询 `src/`、`wxt.config.ts`、`package.json`、`tsconfig.json` 的 mtime 识别真实源码变化；变化后执行 `npm run build`，再优先从已打开的 extension 页面调用 `chrome.runtime.reload()`，最后刷新可见页面。原因：macOS `fs.watch` 在 WXT build/reload 场景下会产生噪声事件，且 MV3 service worker 可能休眠，单纯依赖 service worker reload 不稳定。

**偏差说明**：这不是 Vite HMR；每次变化仍是“build + extension reload”。原因：Chrome 原生 side panel 属于扩展宿主页面，不能像普通 web dev server 那样无缝 HMR。当前实现目标是自动化刷新，而不是保留 React 组件热状态。

**权衡分析**：
- 方案一：复用 WXT dev server/HMR。优点：更接近前端开发体验；缺点：需要进一步确认 WXT 对 Chrome for Testing、自定义 profile、原生 side panel host 的组合支持，且可能与现有 E2E helper 分叉。
- 方案二：在现有 debug 脚本内做轮询 build + runtime reload。优点：简单、可控、复用当前 Chrome for Testing 调试链路；缺点：每次更新会刷新扩展状态。
- 选择方案二，因为：当前需求是让可见调试实例跟随代码更新，稳定性优先。

**验证记录**：
- 真实调用：`BROWSER_HELM_DEBUG_WATCH=1 BROWSER_HELM_DEBUG_CDP_PORT=9339 npm run debug:extension` 成功启动 watch 调试实例。
- 真实调用：`touch src/entrypoints/sidepanel/app.tsx` 后脚本打印 `[debug:extension] Source changed. Rebuilding extension...` 与 `[debug:extension] Extension reloaded.`。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。

**待确认**：
- [ ] 是否后续继续研究 WXT dev server/HMR，以减少 rebuild reload 的等待时间？
- [ ] 是否需要在 reload 后自动重新打开 Chrome 原生 side panel host，而不只是刷新已打开 extension 页面？

## [修复 Side Panel 观察旧 Tab 快照] - [2026-05-24]

**目标**：用户切换到新网站后，BrowserHelm side panel 不应继续展示旧 `basic-form.html` 的 observation 快照。

**设计决策**：保留 `?tabId=` 调试页的固定 tab 行为；原生 Chrome side panel 无 `tabId` 时，每次运行前动态查询 `chrome.tabs.query({ active: true, currentWindow: true })`，并监听 `chrome.tabs.onActivated` / `chrome.tabs.onUpdated` 自动重新观察。原因：真实 side panel 的目标页面是当前窗口 active tab，而不是 side panel 首次打开时的快照。

**偏差说明**：调试页 `chrome-extension://.../sidepanel.html?tabId=...` 仍会固定观察指定 tab。原因：E2E 和独立调试页需要稳定目标 tab；真实侧边栏不带该参数，会跟随当前 active tab。

**权衡分析**：
- 方案一：只要求用户点击 Go 手动刷新。优点：改动最小；缺点：切换 tab 后仍容易误以为数据写死。
- 方案二：动态解析 active tab 并监听 tab 切换/导航。优点：符合侧边栏用户预期；缺点：切换页面时会触发一次新的 runtime observe。
- 选择方案二，因为：side panel 是伴随浏览器当前页面工作的 UI，数据必须跟随上下文变化。

**验证记录**：
- 真实调用：`npm run build` 成功。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。
- 手工检查：已通过 Chrome for Testing 观察到旧实现停留在 `basic-form.html` 快照；修复后产物已 reload 到调试 Chrome，原生 side panel 需重新打开后使用新逻辑。

**待确认**：
- [ ] 是否需要隐藏或弱化调试页的 `?tabId=` 固定模式，避免误当成真实 side panel 行为？

## [稳定扩展 Watch 调试 SOP] - [2026-05-24]

**目标**：按新的 SOP 验证“改一行 side panel 代码后，调试浏览器能自动更新可见 UI”。

**设计决策**：将 `debug:extension:watch` 的更新策略从运行中调用 `chrome.runtime.reload()` 改为源码变化后 rebuild 并重启 Chrome for Testing 调试会话。原因：扩展页面在 runtime reload 后会短暂变成不可访问状态，自动重开 `chrome-extension://.../sidepanel.html` 可能触发 `ERR_BLOCKED_BY_CLIENT`；重启会话更稳定，也更符合全自动调试主路径。

**偏差说明**：watch 更新不是 React HMR，也不是原生 side panel 宿主内无刷新更新；每次变化会重启调试浏览器会话并重新打开 fixture 与 side panel 调试 tab。原因：Chrome 原生 side panel 和 extension page reload 不适合做每次代码调试的自动化主路径。

**权衡分析**：
- 方案一：继续使用 `chrome.runtime.reload()` 并增加重试。优点：保留当前浏览器窗口；缺点：已验证仍会被 Chrome 阻断扩展页加载，稳定性不足。
- 方案二：每次源码变化后重启调试会话。优点：扩展加载、fixture、side panel 调试 tab 都从干净状态恢复；缺点：浏览器窗口会刷新/重开。
- 选择方案二，因为：当前目标是可重复的全自动调试 SOP，稳定性优先于局部热更新体验。

**验证记录**：
- 真实调用：`BROWSER_HELM_DEBUG_CDP_PORT=9345 npm run debug:extension:watch` 成功启动 Chrome for Testing、加载 `.output/chrome-mv3`、打开本地 `basic-form.html` 和 side panel 调试 tab。
- 真实调用：将 side panel 文案从 `SOP OK` 改为 `SOP OK 2` 后，watch 输出 `[debug:extension] Debug browser restarted.` 与 `[debug:extension] Extension updated.`。
- 真实调用：通过 CDP 读取 side panel 调试 tab DOM，确认包含 `SOP OK 2`，且旧的精确 `SOP OK` 行已消失。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。

**待确认**：
- [x] 已恢复正式文案，移除 `SOP OK 2` 临时可见验证标记。

## [v0.2 真实浏览器验收补齐] - [2026-05-24]

**目标**：按浏览器扩展调试 SOP，补齐 v0.2 尚未完成的真实浏览器验收：真实 extension host 内的 observation/ref/error/empty/prompt-injection 可见行为和截图证据。

**设计决策**：使用 `BROWSER_HELM_DEBUG_CDP_PORT=9350 npm run debug:extension:watch` 启动 Chrome for Testing，并通过 CDP 驱动同一个 target tab 与 `chrome-extension://.../sidepanel.html?tabId=...` 调试 tab。原因：该路径能真实加载 unpacked MV3 extension、content script、service worker 和 side panel runtime，同时避免系统 Chrome branded build 无法自动加载 unpacked extension 的限制。

**偏差说明**：仍未把系统 Chrome 手工 Load unpacked + 点击工具栏打开原生右侧 side panel 作为自动通过标准。原因：系统 Chrome 当前只能作为最终人工验收路径；本次自动化验收覆盖的是 Chrome for Testing 真实扩展宿主与 side panel 调试 tab。

**权衡分析**：
- 方案一：只依赖既有 E2E。优点：速度快；缺点：没有保存真实浏览器可视化证据，也缺少 empty 页面真实 fixture。
- 方案二：补 empty fixture/E2E，并用 SOP 会话生成 DOM 断言和截图证据。优点：覆盖 v0.2 设计验收要求中的页面观察、Ref 映射、empty、error 和 prompt injection；缺点：新增一个 fixture 和一个 E2E 用例。
- 选择方案二，因为：v0.2 验收剩余风险集中在真实浏览器中“看见页面”和 side panel 展示是否可信。

**验证记录**：
- 真实调用：`npm run test:e2e` 通过 6 个真实扩展 E2E，新增覆盖无交互元素页面的 empty observation。
- 真实调用：CDP 连接 `http://127.0.0.1:9350`，验证 `basic-form.html` side panel 展示 URL、标题、5 个交互元素、`ref_101`/`ref_102` 和 `bh_page_observe OK`。
- 真实调用：service worker 向 content script 发送 `BH_A11Y_SNAPSHOT`，返回 `ref_101`/`ref_102`/`ref_103` 等可读结构。
- 真实调用：`security/prompt-injection.html` 中的 `ignore previous instructions...` 仅作为 visible text summary 展示，未改变工具策略。
- 真实调用：`empty-page.html` 展示 `页面为空`、`交互元素 0` 和空 Ref 映射提示。
- 真实调用：`dynamic-page.html` 删除元素后解析旧 ref 返回 `REF_STALE`。
- 真实调用：`tabId=999999` side panel 展示 `CONTENT_SCRIPT_UNAVAILABLE` 错误态。
- 截图证据：`artifacts/v0.2-real-browser/basic-sidepanel.png`、`prompt-injection-sidepanel.png`、`empty-sidepanel.png`、`error-sidepanel.png`，结构化证据见 `artifacts/v0.2-real-browser/evidence.json`。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。

**待确认**：
- [ ] 是否还需要你在系统 Chrome 中手工 Load unpacked 后，最终点击工具栏图标确认原生右侧 side panel 打开路径？

## [补齐 v0.2 Ref 映射 Tab 切换] - [2026-05-24]

**目标**：修复 side panel 只展示 Ref 映射区块、但 `Ref 映射` tab 按钮不可点击切换的问题。

**设计决策**：在 `SidePanelView` 内增加本地 `activeTab`，让 `页面观察` 与 `Ref 映射` 成为互斥 tab panel；`交互元素` 和 `表单字段` 先展示 v0.31/v0.32 待实现占位。原因：v0.2 的范围是页面观察与 Ref 映射只读 MVP，不应把后续版本 tab 伪装成已完成数据。

**偏差说明**：本次没有引入 URL hash、runtime store 或跨刷新持久化 tab 状态。原因：这是 v0.2 UI 验收补丁，最小目标是让 tab 行为真实可用。

**权衡分析**：
- 方案一：保留现状，把 Ref 映射作为页面下方区块。优点：零改动；缺点：与设计图和用户预期的 tab 行为不一致。
- 方案二：实现本地 tab state，互斥展示页面观察和 Ref 映射。优点：改动小、符合 v0.2 设计验收；缺点：tab 状态不持久化。
- 选择方案二，因为：Ref 映射 tab 属于 v0.2 MVP 的明确可见范围，应该可点击切换。

**验证记录**：
- UI 单测：`npx vitest run tests/node/ui/sidepanel-render.test.tsx` 通过。
- 相关 E2E：`npx playwright test tests/e2e/specs/extension/ref-mapping.spec.ts tests/e2e/specs/extension/page-observation.spec.ts --reporter=list` 通过 3 个用例。
- 自动化 E2E：`npm run test:e2e` 通过 6 个真实扩展 E2E。
- 静态检查：`npm run typecheck`、`npm run lint` 均通过。

**待确认**：
- [ ] v0.31/v0.32 接入后，是否将当前占位 tab 替换为真实 structured data tab panel？
