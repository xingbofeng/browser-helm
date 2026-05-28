## 官网自动部署接入 CI - 2026-05-29

**目标**：让 `main` 分支通过 CI 后自动把最新落地页发布到正式官网，避免“GitHub 构建成功但官网仍停留旧版本”的人工同步问题。

**设计决策**：在现有 `ci.yml` 中新增独立的 `deploy-landing` job，只在 `push main` 且前置 `typecheck-lint-unit`、`e2e-and-package` 全部成功后触发。部署路径使用 Vercel CLI 的 `pull -> build -> deploy --prebuilt --prod`，而不是只上传 `dist/landing` artifact。这样可以直接复用仓库里的 `vercel.json`、`build:landing` 和 `.vercel/output` 产物链路，并避免本地实测中“整仓源码上传时偶发 EPIPE、中途断流”的问题。

**偏差说明**：本次没有引入第三方 GitHub Action 封装，也没有把 deployment 绑定到 tag release；官网更新先挂在主干 CI 上，release workflow 仍保持独立。
另外补充把 `.vercel/**` 加入 ESLint ignore，避免本地执行 `vercel build` 后生成的 `.vercel/output` 被 preflight 当作源码扫描，导致提交前 lint 假失败。

**权衡分析**：
- 方案一：继续只构建 artifact，手工在 Vercel 点 deploy。优点是改动小；缺点是容易忘，官网和代码长期漂移。
- 方案二：在 CI 成功后直接用 Vercel CLI 部署 prebuilt 输出。优点是链路闭环、与正式项目保持一致；缺点是需要维护 `VERCEL_TOKEN` secret 和项目 ID。
- 选择方案二，因为当前主要问题不是构建失败，而是“没有最后一步正式发布”。

**待确认**：
- [ ] GitHub 仓库 Secrets 中是否已配置 `VERCEL_TOKEN`；若没有，`deploy-landing` 会在认证阶段失败。
- [ ] 后续是否要把 `actions/checkout` / `actions/setup-node` 升级到支持 Node 24 的版本，顺手消除 GitHub 的弃用提醒。

## CI 构建前置与元素高亮稳定性修复 - 2026-05-29

**目标**：修复远端最新提交在 GitHub Actions 中的两处失败：`manifest-contract` 单测在未构建产物时直接失败，以及离屏元素高亮 E2E 在 CI 环境下偶发拿不到高亮 class。

**设计决策**：保留 `manifest-contract` 作为“基于真实编译产物”的契约测试，不把它改写成读取静态配置的伪契约；CI 与 release gate 在 unit tests 前显式执行 `npm run build`，让测试前置条件与流水线一致。元素高亮链路继续在 content RPC handler 内完成，但把 `scrollIntoView` 从 `smooth` 调整为 `auto`，并把高亮保留时间从 1.8 秒延长到 3 秒，降低 CI 上“滚动刚完成，高亮已被移除”的时序脆弱性。

**偏差说明**：本次没有重写 `manifest-contract` 测试结构，也没有把离屏元素高亮断言改成更宽松的非视觉断言；优先修复真实流水线与运行时时序问题。

**权衡分析**：
- 方案一：删除或跳过 `manifest-contract`。优点是 CI 立刻绿；缺点是失去对真实 manifest 产物的回归保护。
- 方案二：保留产物契约测试，并让 workflow 先 build。优点是语义一致、风险小；缺点是 unit gate 会多一次构建耗时。
- 选择方案二，因为失败根因是流水线前置条件缺失，不是测试目标不合理。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm test -- tests/node/config/manifest-contract.test.ts` 通过。
- `npm run test:e2e:no-build -- tests/e2e/specs/extension/cockpit-ui.spec.ts -g "highlights page elements from the merged elements and forms debug tab"` 通过。

**待确认**：
- [ ] 后续是否把 `manifest-contract` 从默认 `npm test` 中拆到单独的“构建产物契约”命令，减少本地开发阶段对 `.output` 的隐式依赖。

## 瀑布流协议消息与执行切换去重 - 2026-05-28

**目标**：修复 provider 内部协议 JSON 短暂闪现成 AI 回复、Ask 切 Act 后重复显示同一条用户消息，以及主界面“当前 run 可修改目标”入口干扰聊天流的问题。

**设计决策**：在 `AgentMessageList` 展示层继续把 provider protocol 视为内部数据，不渲染 `tool_call`、`finish`、`needs_user_input` 等 JSON；对流式半截 JSON 使用轻量特征判断，避免解析完成前闪现。模式切换的新 run 仍由 runtime 正常创建，但 waterfall 对“同一 task + 中间有 mode-switch request + runId 变化”的续跑消息做展示去重。`reviseGoal` 底层 API 暂时保留，先删除 side panel composer 里的可见入口、文案和样式。

**偏差说明**：没有删除 runtime 的 `reviseGoal` / `canReviseGoal` 能力，因为它仍有 node 层契约和实验价值；本次只移除产品主界面入口。`/Users/counter/Downloads/browserhelm-trace-run_8-20260528.jsonl` 实际对应“帮我填一下名字：张三”，不是“这个页面是什么”，但它同样证明模型会输出内部 JSON 决策，UI 不应把这些决策当作最终回复。

**权衡分析**：
- 方案一：从 runtime 层禁止写入 provider-response JSON。优点是源头更干净；缺点是当前 snapshot/trace 仍需要保留 provider 原始输出用于调试。
- 方案二：在展示层过滤内部协议并补去重规则。优点是风险小、能立即修复闪现和重复消息；缺点是底层历史仍会保留这些事件。
- 选择方案二，因为主问题是 waterfall 误展示内部协议和续跑 task，而不是 runtime trace 记录本身。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：33 个测试，覆盖 `needs_user_input` JSON、半截协议 JSON 和切换执行模式去重。
- 根据后续截图补充：点击“切换到执行并继续”也会立即 dismiss 旧 `mode-switch-request` 卡片，避免 Act run 已开始后旧 Ask 升级提示继续留在聊天区。
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：25 个测试，覆盖主界面不再显示“当前 run 可修改目标 / 修改目标”，以及切换执行后旧模式提示不再残留。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。

**待确认**：
- [ ] 是否后续彻底删除底层 `reviseGoal` runtime API，还是保留为 debug/实验能力。

## Waterfall 运行流程 UI - 2026-05-28

**目标**：让 Agent 运行时在主 waterfall 中展示“思考 / 工具 / 思考 / 工具”的流程，而不是只显示单个当前进度卡。

**设计决策**：基于已有 runtime trace 派生轻量 `RunFlowTimeline`，展示 reasoning/tool 两类步骤、工具名、成功状态和耗时；reasoning 只展示安全阶段摘要，不展示 provider 原始 JSON 或内部链式思考。流程卡与现有进度卡共存：timeline 负责过程回放，progress card 负责当前活跃状态。

**偏差说明**：本次没有把 debug drawer 的完整 trace 原样搬进聊天区，也没有展示模型原始输出内容；真实 MV3 side panel 宿主行为仍需后续用扩展调试 SOP 做完整验收。

**权衡分析**：
- 方案一：直接显示 trace JSON。优点是信息最全；缺点是噪声大，也可能暴露内部协议。
- 方案二：只保留单一进度卡。优点是安静；缺点是用户看不到过程。
- 选择方案三：从 trace 投影出用户可读流程，因为它能提供过程感，同时保持主界面克制。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx -t "reasoning/tool"` 先失败后通过，覆盖 reasoning/tool 步骤、工具名和耗时展示。
- 根据用户反馈补充：流程只展示最近一轮最多 3 条，并插入到最终回复前；`npm test -- tests/dom/ui/qa-card.test.tsx -t "流程"` 先失败后通过，覆盖不会展示上一轮工具、流程少量展示，以及最终回复排在流程之后。
- 根据第二轮 UI 反馈补充：最终回复存在时隐藏表单动作卡，只保留最近一轮极简流程摘要，避免工具/思考占据主要屏幕空间。
- 根据第三轮 UI 反馈补充：`model_stream_started` 是内部“下一步决策”输出，不是最终用户回复；进度卡和 trace 文案从“开始生成回复”改为“读取模型决策”，避免切换执行模式时出现误导性闪烁。
- 根据第四轮 UI 反馈补充：状态块属于本轮 AI 回复的前置状态，渲染在当前 AI 回复框上方；当流程状态块存在时不再重复显示绿色进度卡。`model_stream_failed` 和 fallback 状态也进入主 waterfall，用户不用打开 debug 才能看到 429 等模型错误。
- 根据第五轮 UI 反馈补充：去掉 `reasoning/tool` 多卡片日志视觉，改为类似 Codex 的单一回复状态行；主标题只显示“正在思考 / 正在执行动作 / 模型请求失败”，细节作为轻量说明贴在 AI 回复框上方。
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：28 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- Playwright 静态 smoke：通过临时 HTTP 服务打开 `http://127.0.0.1:4173/sidepanel.html`，页面可渲染；仅出现无关 `favicon.ico` 404。该检查没有真实 run trace，不代表 MV3 side panel 宿主验收。

**待确认**：
- [ ] 是否需要让用户手动开关“显示流程”或调整默认展开策略。

## 侧栏清空会话按钮 - 2026-05-28

**目标**：在 side panel 右上角增加清空会话入口，点击后回到初始空会话状态。

**设计决策**：使用 `Trash2` 图标作为 header action。清空时断开当前 run 订阅、清除本地 conversation messages、snapshot、trace、approval、输入草稿和运行显示状态，并把模式重置为 Ask；若当前 run 仍处于活跃状态，顺手调用 `cancelRun`，避免旧 run 后续继续推送状态。

**偏差说明**：本次只清空当前 side panel 的本地会话展示，不删除 runtime 历史记录或持久化调试文件。

**权衡分析**：
- 方案一：只清空消息数组。优点是改动小；缺点是旧 snapshot/trace/订阅会把 UI 刷回旧状态。
- 方案二：统一重置 UI stores 并断开订阅。优点是能真正回到初始状态；缺点是需要给 store 增加 reset/clear API。
- 选择方案二，因为用户要的是“回到初始状态”，不是单纯隐藏消息。

**验证结果**：
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx -t "clears the current session"` 先失败后通过，覆盖清空按钮、草稿清除、状态回 Ready、活跃 run cancel 和 snapshot 内容消失。
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：25 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。

## 多轮聊天顺序修复 - 2026-05-28

**目标**：修复用户在 `waiting_for_user` 后继续回复时，新用户消息被页面观察卡挪到旧回复前面的问题。

**设计决策**：衍生页面观察卡不再用当前最新 `snapshot.runId` 作为锚点，而是锚定第一条用户任务所在 run。这样观察卡仍能固定在初始任务后、回答前，但后续补充消息会按真实聊天顺序追加在旧回复之后。

**二次修正**：根据用户反馈，页面观察卡语义进一步收敛为“会话开头上下文”，不再放在任意任务后。`page_summary` 统一归一到消息列表开头；之后 waterfall 严格按 `用户 -> 状态/思考 -> AI回复` 的轮次追加。

**偏差说明**：本次只修复 waterfall 展示顺序，不改变 runtime 保存消息、trace 或 provider prompt 历史。

**权衡分析**：
- 方案一：按每次最新 run 重新生成观察卡。优点是实现简单；缺点是多轮补充时观察卡会把最新用户消息拉到前面。
- 方案二：把衍生观察卡锚定到第一轮任务。优点是符合“页面观察是上下文，不是每轮新消息”的语义；缺点是如果未来支持跨页面同会话，需要额外按页面 revision 分组。
- 选择方案二，因为当前 side panel 会话围绕同一个页面上下文，多轮补充应该保持聊天顺序。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx -t "多轮补充"` 先失败后通过，覆盖页面观察卡不再把最新用户消息挪到旧回复前。
- `npm test -- tests/dom/ui/qa-card.test.tsx -t "页面观察卡固定|多轮补充"` 通过，覆盖观察卡固定在会话开头。

## 表单已有值修复循环截停 - 2026-05-28

**目标**：修复 Apple 表单“随便填”场景中，模型批量填写包含已有值字段后反复进入 repair/read_fields，等待很久最后以工具参数错误结束的问题。

**设计决策**：保留“不覆盖已有输入”和“不凭空编造账号资料”的安全边界。对 `bh_form_fill_many` 决策先把 checkbox boolean 归一化为 `"true"` / `"false"`；若模型基于“随便填”编造邮箱、密码、电话等值，优先走确定性的“请提供具体字段值”提示，不再先触发已有值 repair。已有值 repair 阶段只允许 `finish` 或 `ask_user`，若模型继续调用 `bh_form_read_fields` / `bh_form_fill_many`，runtime 直接截停并完成为“未覆盖已有输入”。

**偏差说明**：没有放宽 Apple 账户类敏感表单的自动模拟填写；用户仍需提供明确字段值后才会执行填写。

**权衡分析**：
- 方案一：允许模型随便生成测试资料。优点是看似更符合“随便填”；缺点是会编造邮箱、电话、密码并可能覆盖用户已有输入。
- 方案二：继续依赖模型 repair。优点是改动小；缺点是模型可能选择 read_fields 或重复 fill_many，导致长时间等待和最终错误。
- 选择方案三：runtime 对不安全/无效分支做确定性收敛，因为这能保留安全边界，同时避免 repair 空转。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts -t "arbitrary fill includes existing fields|existing-value repair"` 先失败后通过，覆盖 run_23 类似的混合已有值、编造值和 checkbox boolean 场景，以及已有值 repair 后错误调用工具的截停。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：56 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。

**待确认**：
- [ ] 是否需要在 UI 中把“不能随便编造账号资料，请提供具体值”的提示进一步区分为安全策略说明。

## Provider 请求超时调整到 10 分钟 - 2026-05-28

**目标**：按用户要求，不再让 provider 请求在 45 秒时失败；先把模型决策请求超时调整到 10 分钟。

**设计决策**：保留 timeout 保护，但把 `MODEL_DECISION_TIMEOUT_MS` 从 `45_000` 改为 `10 * 60 * 1000`。相比完全取消超时，10 分钟能避免 provider 或网络永久挂起导致 run 一直占用 `thinking` 状态；同时足够覆盖慢模型、冷启动或大 prompt 的首字节等待。

**偏差说明**：本次只调整 runtime 的模型决策超时阈值，没有改 provider UI 设置，也没有改变错误文案。trace summary 会从 `timeout after 45000ms` 变成 `timeout after 600000ms`。

**权衡分析**：
- 方案一：完全去掉超时。优点是不会被 runtime 主动中断；缺点是 provider 永久无响应时 run 会一直挂住。
- 方案二：超时调到 10 分钟。优点是大幅降低误杀慢请求，同时保留兜底释放；缺点是 provider 真挂住时用户最多等 10 分钟才看到失败。
- 选择方案二，因为用户明确接受“或者调成 10 分钟”，且这是更稳的默认行为。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts -t "fails stuck model requests"` 先失败后通过：45 秒仍保持 `thinking`，累计 600000ms 才失败并记录 `timeout after 600000ms`。

**待确认**：
- [ ] 后续是否把 provider timeout 做成设置项，允许不同模型/provider 单独配置。

## Provider Prompt 历史预算与 trace 压缩 - 2026-05-28

**目标**：分析 `/Users/counter/Downloads/browserhelm-trace-run_9-20260528.jsonl` 中 Apple 页面连续“模型请求超时”的原因，并修复多轮历史把 provider prompt 撑大后导致请求首 token 超时的问题。

**设计决策**：保留 side panel 向 runtime 传递完整历史的行为，但在 `UnifiedRuntimeAgentLoop` 真正构造 provider prompt 时做预算控制：普通对话历史保留并脱敏；`Previous run trace` 不再原样塞入模型上下文，而是压缩为最近 12 个关键 trace 事件摘要；最终 `messages` 通过 `MAX_TOTAL_PROMPT_CHARS = 32000` 总预算约束。这样既保留“上一轮发生了什么”的语义，又避免 trace JSON 在多轮对话里递归膨胀。

**偏差说明**：本次没有取消 45 秒 provider 请求超时，也没有对 UI/runtime 保存的 trace 做裁剪；修复点只在“发送给模型的 prompt”这一层。trace_9 显示请求阶段本身耗时 45008ms、charCount=0，说明页面观察和 Chrome RPC 已完成，真正失败点是 provider 首字节超时。

**权衡分析**：
- 方案一：直接把模型超时调大。优点是改动小；缺点是 prompt 仍会越来越大，用户等待更久后还是可能失败。
- 方案二：只删掉历史。优点是请求快；缺点是会回到“失忆”问题。
- 方案三：保留可读对话历史，压缩机器 trace 并限制总 prompt。优点是兼顾多轮记忆和 provider 响应速度；缺点是模型看不到完整原始 trace JSON。
- 选择方案三，因为根因是历史 trace 无预算膨胀，而模型通常只需要最近关键 trace 事件来理解上一轮状态。

**验证结果**：
- 复盘 trace_9：`historyCount=7`，`context_built.estimatedChars=41515`，`model_stream_started` 到 `model_stream_failed` 间隔 45008ms，`charCount=0`，summary 为 `timeout after 45000ms`。
- `npm test -- tests/node/runtime/run-manager.test.ts -t "bounds large previous trace history"` 先失败后通过，压力用例 prompt 从 97181 chars 降到 19417 chars。
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/runtime/runtime-messages.test.ts tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/dom/ui/qa-card.test.tsx` 通过：4 个文件 / 107 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。
- 真实调用：`BROWSER_HELM_REAL_SITE_E2E=1 npx playwright test tests/e2e/specs/real-sites/real-sites.spec.ts -g "Apple"` 通过，真实打开 `https://account.apple.com/account`，只填写低敏字段、不提交。

**待确认**：
- [ ] 后续是否把 provider 超时做成用户可配置项，或者在 UI 中显示“已发送请求，等待首字节”的更细状态。

## Page Health Hook CSP 修复 - 2026-05-28

**目标**：修复 content script 在页面上下文注入 page-health hook 时使用 inline script，导致 Apple、知乎等严格 CSP 页面报 `Executing inline script violates Content Security Policy` 的问题。

**设计决策**：把 page-health hook 从 `script.textContent` 搬到 `public/page-health-hook.js`，content script 只通过 `chrome.runtime.getURL('page-health-hook.js')` 设置 `script.src` 注入，并在 manifest `web_accessible_resources` 中显式暴露该资源。页面仍在 page context 中安装 console/fetch/XHR 轻量 hook，content script 继续通过 `postMessage` 接收 page-health 事件。

**偏差说明**：没有改成 content script isolated world 内直接监听 `fetch`/`XMLHttpRequest`，因为那样无法可靠捕获页面主世界里被页面代码替换或调用的对象；本次只移除 CSP 不允许的内联脚本形态。

**权衡分析**：
- 方案一：给 inline script 加 hash/nonce。优点是改动小；缺点是第三方页面 CSP 不受扩展控制，且 MV3/页面 CSP 组合下仍不稳定。
- 方案二：改为 web-accessible 外部脚本。优点是符合严格 CSP 页面执行模型，构建产物可检查；缺点是新增一个公开扩展资源。
- 选择方案二，因为它直接消除 inline execution，且保留 page context hook 能力。

**验证结果**：
- `npm test -- tests/node/entrypoints/content-config.test.ts -t "page-health hooks"` 先失败后通过，覆盖不再注入 `textContent`，改为 `page-health-hook.js`。
- `npm test -- tests/node/entrypoints/content-config.test.ts tests/node/entrypoints/content-page-health.test.ts` 通过：2 个文件 / 10 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过，构建产物包含 `.output/chrome-mv3/page-health-hook.js`，manifest 暴露 `page-health-hook.js`。
- `npm run test:e2e` 通过：41 passed / 4 skipped。
- 真实调用：`BROWSER_HELM_REAL_SITE_E2E=1 npx playwright test tests/e2e/specs/real-sites/real-sites.spec.ts -g "Apple"` 通过，真实打开 `https://account.apple.com/account`，只填写低敏字段、不提交。
- 真实页面 CSP 检查：Chrome for Testing 加载扩展后打开 `https://account.apple.com/account` 和 `https://www.zhihu.com/`，console 中 `Executing inline script violates` / `unsafe-inline` / `Content Security Policy` 命中数均为 0。

**待确认**：
- [ ] 后续是否把 Apple/知乎 CSP smoke 固化成 opt-in real-site E2E 用例，避免只靠临时 SOP。

## Trace Console 打印 - 2026-05-28

**目标**：让 runtime 追加的 trace 事件同时出现在扩展 background console 中，方便真实页面调试时不必每次下载 JSONL 才能看到事件流。

**设计决策**：在 `RunStore.appendTrace()` 这个统一 trace 入口增加 console sink。合法事件写入 `record.trace` 后打印同一个 validated event；非法事件被转换成 `runtime_event_invalid` 后也打印该 marker。默认使用 `console.info('[BrowserHelm trace]', event)`，测试中可通过 `new RunStore({ traceConsole })` 注入 spy，避免绑定全局 console。

**偏差说明**：本次只打印 appendTrace 产生的 runtime trace，不打印 `snapshot_updated` 这类订阅通知事件，因为它不是持久 trace JSONL 的一部分。

**权衡分析**：
- 方案一：在每个调用点手写 console。优点是可定制；缺点是容易漏事件，且格式不一致。
- 方案二：在 `RunStore.appendTrace()` 统一打印。优点是所有 runtime/lifecycle/tool/approval/agent-loop trace 自动覆盖；缺点是 background console 会更吵。
- 选择方案二，因为用户目标是“所有 trace 日志都能在 console 里面打印出来”。

**验证结果**：
- `npm test -- tests/node/runtime/run/run-store.test.ts -t "prints"` 先失败后通过，覆盖合法事件和 invalid marker 打印。
- `npm test -- tests/node/runtime/run/run-store.test.ts tests/node/runtime/run-manager.test.ts tests/node/runtime/runtime-messages.test.ts` 通过：3 个文件 / 73 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。

**待确认**：
- [ ] 后续是否要加一个 settings 开关控制 trace console verbosity，避免普通用户使用时 background console 过于密集。

## run_6 trace replay 决策解析修复 - 2026-05-28

**目标**：回放 `/Users/counter/Downloads/browserhelm-trace-run_6-20260528.jsonl`，修复知乎总结任务中模型已经返回可用 `finish`，但 parser 因 provider envelope 形态不兼容而判失败，导致后续重复读文章、最终要求切 Act 的问题。

**设计决策**：`DecisionParser` 兼容 provider JSON mode 常见 envelope：`{"type":"decision","decision":"finish","finish":{"message":"..."}}` 归一化为标准 `{type:"finish", message}`；同时兼容 run_6 中旧工具名 `bh_page_get_visible_text`，归一化为 `bh_page_read_visible_text`。没有把 `{"type":"decision","decision":"bh_request_act_mode"}` 这类非标准工具 envelope 直接当工具调用，因为 run_6 中较早的 Act 请求是过早判断，保留 schema reject + repair 反而能让模型改用 `bh_page_read_article` 获取文章内容。

**偏差说明**：本次没有实现正式 trace replay engine；使用临时脚本逐条读取 JSONL 中的 `model_stream_finished.finalPreview`，验证当前 parser 对 run_6 的关键历史输出会在第 37 行到达 `finish`。正式 replay/eval 仍属于后续平台能力。

**权衡分析**：
- 方案一：接受所有 `type: decision` + `decision: bh_*` 为工具调用。优点是兼容面广；缺点是会让 run_6 在过早的 `bh_request_act_mode` 处停止，反而拿不到后续文章读取和总结。
- 方案二：只兼容 terminal envelope 和明确旧工具别名。优点是精准修复根因，保留 repair 对错误工具选择的纠偏作用；缺点是未来新 envelope 仍需按 trace 增补。
- 选择方案二，因为这份 trace 的根因是 terminal `finish` envelope 未被解析，而不是所有 `decision` envelope 都应该执行。

**验证结果**：
- `npm test -- tests/node/agent/parser/decision-parser.test.ts -t "run_6"` 先失败后通过，覆盖 run_6 的 `finish` envelope 和旧工具别名。
- JSONL 回放脚本通过：第 9 行解析为 `bh_page_read_visible_text`，第 37 行解析为 `finish`，不再泄露原始 JSON 或继续空转。
- `npm test -- tests/node/agent/parser/decision-parser.test.ts tests/node/runtime/run-manager.test.ts tests/node/runtime/runtime-messages.test.ts` 通过：3 个文件 / 71 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。

**待确认**：
- [ ] 是否要把临时 JSONL replay 脚本沉淀成 `tests/node/eval/replay` 下的正式 trace replay reader。

## 运行进度文案与原始决策 JSON 过滤 - 2026-05-28

**目标**：修复 Agent 运行中进度卡长期显示固定“正在让 AI 选择下一步”文案、计时反复归零，以及瀑布流把 provider 返回的原始 AgentDecision JSON 当成普通回复展示的问题。

**设计决策**：`model_stream_started` / `model_stream_delta` 显示专门的“正在接收 AI 输出”进度，detail 展示已收到字符数；计时起点固定为对应 `model_stream_started` 的 timestamp，避免每个 delta 都把秒表重置成 `0s`。瀑布流显示前过滤符合 BrowserHelm 决策协议形态的原始 JSON（如 `decision/finish/tool_call/multi`），最终面向用户的内容仍由 runtime 的 `agent-final` 或 recommendation/error 消息展示。兜底 thinking 文案改为“正在准备下一步”，不再使用“正在让 AI 选择下一步”。

**偏差说明**：stream delta 仍不展示模型原始文本内容，因为 trace 只记录 `charCount`，不记录 raw delta；这是为了避免泄漏工具参数和未解析 JSON。用户可见文本只显示安全的进度描述和最终消息。

**权衡分析**：
- 方案一：把模型 streaming 原文直接放进瀑布流。优点是看起来更实时；缺点是会暴露 JSON 决策和中间工具参数。
- 方案二：不展示原文，只把当前 runtime 阶段投影到进度卡。优点是安全且体验稳定；缺点是不能看到逐字 token。
- 选择方案二，因为 BrowserHelm 的 provider 输出是内部决策协议，不应直接作为用户回复展示。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx -t "model streaming|provider decision"` 先失败后通过，覆盖计时和 JSON 过滤回归。
- `npm test -- tests/dom/ui/qa-card.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：2 个文件 / 47 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。
- 真实调用：`BROWSER_HELM_REAL_SITE_E2E=1 npx playwright test tests/e2e/specs/real-sites/real-sites.spec.ts -g "Apple"` 通过，真实打开 `https://account.apple.com/account` 并只填写低敏字段、不提交。

**待确认**：
- [ ] 后续是否要把进度卡 detail 从“字符数”升级为更细的阶段说明，例如“正在校验 JSON / 准备执行工具 / 生成最终回复”。

## waiting_for_user 终态与全量历史传递 - 2026-05-28

**目标**：修复 AgentLoop 已经进入 `waiting_for_user` 后，UI 仍显示“等待你的补充”运行进度卡和 loading 感的问题；同时让下一轮用户补充时带上上一轮完整上下文，包括已显示消息和 tool trace。

**设计决策**：`waiting_for_user` 不再被 `AgentMessageList` 视为 active run status，因此不会渲染运行进度卡；用户补充信息时仍可直接在输入框发起下一轮。`conversationHistoryFromMessages` 不再只保留 `status: complete` 的消息，而是先合并本地 `conversationMessages` 与当前 `snapshot.messages`，再带上所有有内容的已显示消息；同时追加一条 `system` 历史 `Previous run trace`，内容为上一轮 `snapshot.trace` 的完整 JSON，暂不做 tool_call 压缩。

**偏差说明**：本次没有改变 runtime 的 terminal decision 语义，也没有引入 trace 压缩；全量 trace 可能增加 prompt 体积，后续再做压缩/截断策略。

**权衡分析**：
- 方案一：保留等待进度卡但去掉 spinner。优点是改动小；缺点是用户仍会觉得 loop 没结束。
- 方案二：把 `waiting_for_user` 当作终态，不显示运行进度卡。优点是符合 agent loop 已结束的语义；缺点是等待态只通过 recommendation 卡表达。
- 选择方案二，因为用户补充应开启下一轮 run，而不是让上一轮继续 loading。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：2 个文件 / 44 个测试。
- `npm test -- tests/dom/ui/qa-card.test.tsx tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx tests/node/runtime/runtime-messages.test.ts tests/node/runtime/run-manager.test.ts` 通过：4 个文件 / 104 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 首轮 40 passed / 1 failed / 4 skipped，失败为无关 `Alt/Opt+Shift+B` floating panel 快捷键时序用例。
- 单独重跑失败用例 `npx playwright test tests/e2e/specs/extension/floating-panel.spec.ts -g "Alt/Opt\\+Shift\\+B"` 通过：1 passed。
- 修复快照消息合并后再次运行 `npm run test:e2e` 通过：41 passed / 4 skipped。

**待确认**：
- [ ] 后续是否为 `Previous run trace` 增加压缩和敏感字段二次裁剪。

## 多轮会话历史与 ask_user 收尾修复 - 2026-05-28

**目标**：修复 `browserhelm-trace-run_12` 中第二轮用户只回复“你随便填就行”时，runtime/model 没拿到上一轮会话历史，导致模型只能基于当前短句猜任务；同时修复模型输出 `bh_ask_user` 被当作未知工具 repair，最后转成 `fail` / 运行错误的问题。

**设计决策**：`StartRunInput` 新增 `conversationHistory`，side panel 每次用户发起新 run 或从 Ask->Act 继续时，把当前 waterfall 中已完成的历史消息一并传给 runtime；`UnifiedRuntimeAgentLoop` 在 provider prompt 中插入 `Conversation history before current request` 段落，并对历史内容做 redaction。`DecisionParser` 兼容 provider 旧形态 `{"type":"tool_call","tool":"bh_ask_user","args":{"message":"..."}}`，归一化为 terminal `ask_user`。`ask_user` 收尾改为非错误 recommendation 消息，不再写入 `snapshot.error`，避免 UI 出现“运行出错”。

**偏差说明**：没有允许“随便填”自动编造 Apple 账户个人信息；历史只帮助模型理解“这句话是在接着上轮说什么”，安全边界仍要求明确字段值。历史中的邮箱等敏感字段进入模型上下文前会被 redaction。

**权衡分析**：
- 方案一：只把当前 task 拼接成“上一轮 + 当前轮”。优点是实现小；缺点是破坏 UI/runtime 消息边界，后续多轮不可扩展。
- 方案二：为 `startRun` 增加结构化 `conversationHistory`。优点是协议清晰，可用于 prompt 和后续调试；缺点是 runtime 入参 schema 需要扩展。
- 方案三：保留 `bh_ask_user` repair。优点是无需 parser 兼容；缺点是会多一次模型调用，并可能像 trace_12 一样被 repair 成 `fail`。
- 选择方案二，并在 parser 层兼容 `bh_ask_user`，因为这更接近正常 agent 客户端的多轮上下文体验。

**验证结果**：
- `npm test -- tests/node/agent/parser/decision-parser.test.ts` 通过：9 个测试。
- `npm test -- tests/node/runtime/runtime-messages.test.ts` 通过：6 个测试。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：51 个测试。
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：21 个测试。
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：19 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 个扩展 E2E 测试，4 个 real-sites smoke 按配置跳过。

**待确认**：
- [ ] 是否需要在 Debug Drawer 中显示本轮传入的 `conversationHistory` 条数和摘要，方便以后排查“模型到底看到了哪些历史”。

## 已有值字段收尾与滚动跟随修复 - 2026-05-28

**目标**：修复 `browserhelm-trace-run_2` 中模型尝试填写已有值字段后，runtime 把 `field already has a value` 当成运行错误，导致 UI 看起来一直等待/转圈且没有最终回复的问题；同时修复进度计时刷新时强制滚到底部，用户上翻拖不动的问题。

**设计决策**：保留“不自动覆盖已有输入”的保护，但把已有值字段视为模型决策 repair，而不是 fatal tool error。模型若要填写已有值字段，runtime 会要求它改为 `finish`（当前页面已满足任务）或 `ask_user`（需要用户确认覆盖），不执行重复填写。UI 滚动改为“贴近底部才自动跟随”；用户手动上翻后，进度计时更新不再强制拉回底部。`waiting_for_user` 也不再显示旋转 loader，只保留稳定等待态。

**偏差说明**：没有放宽覆盖已有输入的安全边界；如果字段已有不同内容且模型无法确认是否满足任务，仍应向用户询问是否覆盖。SOP 使用本地 fixture 预填字段模拟真实已有值，不使用第三方网站作为默认验证目标。

**权衡分析**：
- 方案一：允许覆盖已有值。优点是搜索/填写更直接；缺点是可能覆盖用户输入。
- 方案二：保持阻止覆盖，但直接报错。优点是最保守；缺点是用户看到“运行出错”和卡住感。
- 方案三：阻止覆盖并让模型 repair 到 `finish` / `ask_user`。优点是安全边界不变，体验像正常 agent；缺点是多一次模型决策。
- 选择方案三，因为已有值不是系统异常，而是 agent 需要收尾或请用户确认的正常状态。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：49 个测试。
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：19 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 个扩展 E2E 测试，4 个 real-sites smoke 按配置跳过。
- 真实调用：按扩展调试 SOP 用 Chrome for Testing 加载 MV3 扩展，目标页 `tests/e2e/fixtures/basic-form.html`。先通过 CDP 预填邮箱 `test@example.com`，再执行“请把邮箱字段填成 test@example.com，不要填写密码，不要提交表单”；最终状态为“完成”，回复“邮箱字段已正确填写为 [REDACTED_EMAIL]，密码未被填写，表单未提交。”，未出现运行错误或残留 spinner。截图：`/tmp/browserhelm-existing-value-sop-final.png`。

**待确认**：
- [ ] 后续是否需要在 UI 中展示“字段已有值，未覆盖”的专用工具/决策卡，进一步减少用户困惑。

## AgentLoop 填写后 finish 决策约束 - 2026-05-28

**目标**：修复字段填写成功后，AI 下一轮没有足够强的上下文约束，可能长时间不返回 `finish`、重复填写/验证，或把普通文本回复误判成错误的问题。

**设计决策**：保留 `finish` 由 AI 决定，但不再把 `bh_agent_finish` / `bh_agent_fail` / `bh_agent_ask_user` 作为可调用工具暴露给模型；`finish`、`ask_user`、`fail` 只存在于 terminal decision schema。runtime 在模型输入中加入 `decisionGuidance`：上一轮 `bh_form_fill_many` / `bh_form_fill_field` 成功时，提示 AI 下一步必须 `bh_form_verify` 或在非提交搜索/文本输入场景直接 `finish`，并禁止重复填写同值；上一轮 `bh_form_verify` 成功时，提示 AI 若用户未要求提交应立即 `finish`，不要重复 verify。若模型仍重复调用填写/验证工具，runtime repair 会拒绝执行重复工具并要求重新决策。若模型在 repair 后返回非空普通文本，runtime 将其视为 `finish` 消息，避免“已经回复了但 run 失败”。

**偏差说明**：没有让 runtime 在工具成功后直接结束 run，也没有跳过 AI 的最终用户可见总结；只把 terminal decision 和工具调用边界分清，并增强填后/验证后的决策约束与 repair。

**权衡分析**：
- 方案一：runtime 在填写成功后直接 finish。优点是快；缺点是 final message 缺少任务语义，复杂表单、是否提交等解释容易机械化。
- 方案二：runtime 自动 verify 后直接 finish。优点是可控；缺点是仍会替 AI 决定收尾文案和是否继续。
- 方案三：把填后/验证后状态作为 `decisionGuidance` 喂给 AI，并在重复工具决策时 repair。优点是保留 AI finish，同时减少空转；缺点是仍需要一次额外模型决策。
- 选择方案三，因为当前产品语义希望 AI 负责最终回复，runtime 只提供强约束上下文；内部 terminal 工具不暴露给模型可以降低“finish 是工具还是返回值”的混乱。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：48 个测试。
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：18 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 个扩展 E2E 测试，4 个 real-sites smoke 按配置跳过。
- 真实调用：按扩展调试 SOP 用 Chrome for Testing 加载 MV3 扩展，目标页 `tests/e2e/fixtures/basic-form.html`。执行“请只填写邮箱字段。邮箱：test@example.com。不要填写密码，不要提交表单”；填写后进度卡显示“正在确认已填写内容”，最终状态为“完成”，页面邮箱字段已写入，密码和提交未执行。截图：`/tmp/browserhelm-decision-guidance-sop-final.png`。

**待确认**：
- [ ] 是否需要把 `decisionGuidance` 的当前决策约束在 Debug Drawer 中单独展示，方便排查模型为什么选择 verify 或 finish。

## 填写后进度态说明优化 - 2026-05-28

**目标**：修复字段已经填写完成后，进度卡仍显示“正在让 AI 选择下一步”，导致用户误以为任务卡住的问题。

**设计决策**：不改变 AgentLoop 的安全流程；`bh_form_fill_many` / `bh_form_fill_field` 成功后如果 run 进入 thinking 且还未出现后续 `bh_form_verify`，进度卡显示“正在确认已填写内容”，说明字段已写入、系统正在判断是否需要验证或结束。

**偏差说明**：本次没有跳过填写后 verify，也没有把搜索类填写自动提交；只是把中间态文案与真实状态对齐。

**权衡分析**：
- 方案一：字段填写完成后直接隐藏 loading。优点是安静；缺点是 run 仍在继续，用户无法知道后续校验/结束还没完成。
- 方案二：保留 progress，但按最近工具结果展示“确认已填写内容”。优点是诚实表达状态；缺点是 UI 需要从 trace 推导后填充阶段。
- 选择方案二，因为它解释了“已填完但还没结束”的真实原因。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：18 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 搜索框填写完成后是否应默认 finish，而不是继续让模型决定是否 verify。

## 表单安全拒绝与运行进度文案修复 - 2026-05-28

**目标**：修复 Apple account trace 中“随便填表单”触发安全拒绝后 UI 显示红色“运行出错”，以及运行中长期显示固定“正在思考下一步”的问题。

**设计决策**：保留 runtime “表单值必须来自用户明确提供内容”的安全边界，但将该类拒绝展示为 `recommendation` 消息和 `waiting_for_user` 状态，不再写入 `snapshot.error`。进度卡按当前 status 和最新 trace 阶段显示：准备上下文、AI 选择下一步、读取 AI 决策、等待用户补充等。

**偏差说明**：本次没有放宽“随便填 / 模拟填”策略，也没有允许模型编造邮箱、手机号、密码等个人信息；Apple 页面真实验证中仍会要求用户提供具体字段值。

**权衡分析**：
- 方案一：把工具拒绝文案从英文改中文但仍作为 error。优点是改动小；缺点是用户仍会看到“运行出错”，语义不对。
- 方案二：将可恢复的表单安全拒绝改为补充信息请求。优点是符合安全边界和用户心智；缺点是 runtime 需要区分 policy ask 与真实错误。
- 选择方案二，因为这类情况不是系统异常，而是 Agent 需要用户提供明确值后才能继续。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：16 个测试。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：41 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 真实调用：按扩展调试 SOP 用 Chrome for Testing 加载 MV3 扩展，目标页 `https://account.apple.com/account`，执行“帮我填下表单，随便填，每个字段都模拟填下”；结果显示“需要你提供具体字段值”和“等待你的补充”，未出现“运行出错”。截图：`/tmp/browserhelm-apple-verify-fixed.png`。

**待确认**：
- [ ] 是否需要把“需要你提供具体字段值”里的字段列表进一步按 label / placeholder / ref 分组展示，避免复杂页面中字段名过长。

## Ask 模式填表请求与 ask_user 输出修复 - 2026-05-28

**目标**：修复 `browserhelm-trace-run_31` 中 Ask 模式“帮我填下表单，随便填”没有出现模式升级卡，而是进入模型后因 `ask/message`、`ask_user/message` 输出不符合 schema 导致 run error 的问题。

**设计决策**：任务分类的 action intent 识别补充 `填下`、`模拟填`、`随便填`，让 Ask 模式下的填表请求先走“需要执行模式”卡片，不再启动页面 observation/AgentLoop。DecisionParser 同时兼容 provider 常见的追问变体：`type: "ask"` + `message` 和 `type: "ask_user"` + `message` 都归一化为标准 `ask_user.question`。

**偏差说明**：没有允许“随便填”自动编造个人信息；即使用户切到 Act，敏感字段和值来源校验仍会阻止模型自行发明姓名、邮箱、密码、电话等数据。

**权衡分析**：
- 方案一：只加强 prompt，让模型输出 `question`。优点是无代码兼容逻辑；缺点是 provider 仍可能输出常见 `message` 字段，真实运行不稳。
- 方案二：解析器兼容常见 ask 变体，同时让 Ask 填表意图更早进入模式升级卡。优点是同时修复当前 trace 的两个断点；缺点是 parser 多了一层 provider 输出归一化。
- 选择方案二，因为根因既有前置意图漏识别，也有模型输出形态兼容不足。

**验证结果**：
- `npm test -- tests/node/agent/parser/decision-parser.test.ts` 通过：1 个文件 / 8 个测试。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：1 个文件 / 42 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 是否需要把更多中文动作短语（例如“帮我弄一下”“试填”）纳入 action intent，还是保持当前较保守集合。

## Ask 到 Act 模式升级卡片 - 2026-05-28

**目标**：优化 Ask 模式下用户提出页面写入请求时的交互，不再只提示“切换到 Act 后重发”，而是在卡片内提供“切换到执行并继续 / 保持 Ask”两个明确动作。

**设计决策**：保留 runtime 的 Ask 只读拦截边界，前端识别 `:mode-switch-request` recommendation 消息并渲染专用 action 区。用户点击“切换到执行并继续”时，从当前 run 的用户 task 消息中读取原始请求，用 `mode: 'act'` 和同一 `targetTabId` 自动启动新 run；点击“保持 Ask”只在本地隐藏该升级卡片，不改变页面、不启动新 run。

**偏差说明**：本次只处理 Ask -> Act 的模式升级卡片；没有放宽 Ask 模式工具权限，也没有引入通用 click 工具。高风险发送、提交、删除等最终动作仍沿用单独 approval。

**权衡分析**：
- 方案一：只把文案改成提示用户手动切 Act。优点是实现最小；缺点是用户需要重复操作，容易中断任务。
- 方案二：卡片主按钮自动以 Act 继续当前请求。优点是用户意图明确、交互闭环短；缺点是前端需要从当前消息流恢复原始 task。
- 选择方案二，因为用户已经在卡片上显式授权继续执行，且 runtime 仍保留低风险填写和高风险审批边界。

**验证结果**：
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过：1 个文件 / 21 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 是否需要后续把“保持 Ask”改成保留卡片但折叠，而不是直接隐藏。

## AgentLoop 未知工具决策修复 - 2026-05-28

**目标**：修复真实 trace 中模型输出不存在的 `bh_click` 后，runtime 仍把该工具送入 ToolRouter 并返回 `TOOL_NOT_FOUND` 的问题。

**设计决策**：在 `UnifiedRuntimeAgentLoop` 中把工具名可用性作为模型决策语义校验，发生未知工具时复用一次 repair 提示，让模型只能从当前 run mode 的 `availableTools` 中重新选择；若 repair 后仍非法，则 run 失败而不是执行未知工具。同时移除 AgentLoop 中重复写入的 `tool_started`，由工具执行层统一记录执行事件。

**偏差说明**：本次没有新增通用 `bh_click` 工具，也没有把搜索行为改成点击/键入模拟；普通搜索框仍应走现有 `bh_form_fill_many` / `bh_form_verify` 路径。

**权衡分析**：
- 方案一：把 `bh_click` 映射成某个现有 iframe/action 工具。优点是短期能吞掉模型幻觉；缺点是可能把普通页面点击错误映射成高风险或错误 frame 行为。
- 方案二：在 AgentLoop 层拦截不可用工具并要求模型修复。优点是保持工具边界可信，避免未知工具进入执行层；缺点是多一次 provider 调用。
- 选择方案二，因为根因是模型决策语义未校验，不是缺少一个通用点击工具。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：1 个文件 / 41 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 是否要后续把“未知工具 repair”在 Trace UI 中展示为更友好的模型修复事件，而不是沿用 `decision_parse_failed`。

## 提交前自动校验钩子补齐 - 2026-05-28

**目标**：让“提交前必须跑 typecheck/eslint/test/e2e”变为本地可自动执行，减少人工遗漏。

**设计决策**：新增 `scripts/setup-pre-commit-hook.ts`，在 `npm run postinstall` 时写入 `.git/hooks/pre-commit`，钩子执行 `npm run preflight`。

**偏差说明**：`pre-commit` 由 npm 生命周期安装到仓库本地 `.git/hooks`，不会影响跨平台 CI，仅在有 git 工作树的开发环境生效。

**权衡分析**：
- 方案一：依赖开发者手动在每台机器运行 `npm run preflight`。优点是无额外脚本。缺点是高遗漏率。
- 方案二：加入本地钩子安装脚本。优点是提交前强约束。缺点是初次 `npm install` 会写入 `.git/hooks`。
- 选择方案二，因为任务明确要求提交前自动执行检查。

**验证结果**：
- 预置脚本已写入 `package.json`：`setup:hooks`、`postinstall`；钩子脚本文件已新增并可重入安装。

**待确认**：
- [ ] 是否接受每次 `npm install` 同步刷新 `pre-commit`（建议保留以保证一致性）。

## 发布与域名配置收口 - 2026-05-28

**目标**：完成发布后可直接下载的官网构建产物和自定义域名可访问性。

**设计决策**：在 CI 与 Vercel build 命令基础上，执行 `npm run build:landing` 并使用最新 production build 重新部署；对 `brower-helm.counterxing.top`，确认该子域已在 Vercel 项目 `browser-helm` 上显示为分配域名，并尝试创建 A 记录 `76.76.21.21`。

**偏差说明**：Vercel 侧域名配置已写入，当前卡在外部 DNS 解析未生效（解析返回 `28.0.0.60`，非 Vercel 的指向值），因此自定义域暂未可访问。该问题与本仓库代码无关，需在域名托管方补齐解析。

**验证结果**：
- `npm run preflight` 通过（`typecheck + lint + test + test:e2e`）。
- `npm run build:landing` 通过，生成 `dist/landing/browser-helm-latest.zip`。
- Vercel 已成功生产部署并更新到 `browser-helm-96xy280ti-counterxing-4213s-projects.vercel.app`，并保留 `browser-helm.vercel.app` 别名。
- `brower-helm.counterxing.top` 已在 Vercel 显示为 `browser-helm` 项目域名，建议记录值 `A 76.76.21.21`。

## 发布与官网打包交付 - 2026-05-28

**目标**：建立提交前脚本与 GitHub CI 校验，生成可下载的落地页打包产物，配置 Vercel 项目部署与 GitHub 仓库官方入口。

**设计决策**：将“提交前检查”统一为 `preflight`（`typecheck + lint + test + test:e2e`），并新增 `build:landing` 用于产出静态落地页目录（复制 `.output/chrome-mv3/options.html` 与 `browser-helm-latest.zip`）。Vercel 采用该产物作为输出目录。

**偏差说明**：Vercel 自动部署成功，当前环境未能完成 `brower-helm.counterxing.top` 自定义域名绑定（CLI 返回域名访问权限/记录管理不足）。可通过域名供应商添加 CNAME 并在有域名授权的同一账号继续 `vercel alias` 完成。

**权衡分析**：
- 方案一：新增独立官网站点静态前端。优点是与扩展代码解耦。缺点是新增构建链路和域名托管配置。
- 方案二：复用 `options` 落地页产物并构建成 Vercel 静态站。优点是改动小、资源复用高。缺点是网站与 options 页面文本共享。
- 选择方案二，因为当前目标是尽快可交付“下载按钮 -> ZIP 包”路径。

**验证结果**：
- `npm run preflight`
- `npm run test:e2e`
- `npm run build:landing`
- `npm run build`（Vercel 部署构建）

**待确认**：
- [ ] 请确认是否允许我在同一账号/团队继续完成 `brower-helm.counterxing.top` 的域名验证与绑定。

## Options 暗色落地页 - 2026-05-28

**目标**：仿照 wechatsync.com 的信息结构，为 BrowserHelm 生成一个简单暗色落地页，并保留右上角多语言选择。

**设计决策**：复用现有 `options` 入口承载落地页，因为该入口原本只是 settings 占位，不影响 Cockpit UI 主路径。页面移除顶部导航栏、定价和文档导向，仅保留右上角语言切换；首屏使用 BrowserHelm 品牌、产品 mockup 和 Ask/Act/Cockpit 语义突出项目能力。
后续按视觉反馈补回右上角 GitHub / 安装扩展操作，并将语言切换从原生 select 改为自绘深色菜单，避免出现系统默认下拉样式；首屏两个 CTA 同步改为“安装扩展”和“访问 GitHub”。

**偏差说明**：Codex Browser 工具本轮未暴露，视觉验证使用 Playwright fallback 和本地静态服务完成；没有验证真实 Chrome options 页面宿主，只验证了构建产物静态渲染。

**权衡分析**：
- 方案一：新增独立官网入口。优点是职责清晰；缺点是需要额外 WXT 入口和路由约定。
- 方案二：复用 `options` 入口。优点是改动小、可直接构建预览；缺点是后续若 options 要恢复设置页，需要再拆入口。
- 选择方案二，因为当前需求是简单落地页，且 `options` 入口还没有真实设置功能。

**验证结果**：
- `npm run build` 通过。
- `npm run typecheck` 未通过：当前工作树中 `tests/node/ui/sidepanel/cockpit-app.test.tsx` 存在 TS1109 语法错误，和本次 options 落地页改动无关。
- `npm run lint` 未通过：当前工作树中多个测试文件存在未使用 `I18nProvider` import，和本次 options 落地页改动无关。
- Playwright fallback 打开 `http://127.0.0.1:4173/options.html`，桌面与 390px 移动宽度结构快照可读；截图检查确认无顶部导航栏、右上角 GitHub / 安装扩展 / 语言选择存在、首屏暗色风格生效。

**待确认**：
- [ ] 后续是否需要把落地页从 `options` 拆成独立官网入口？

## v1.1 安全与运行时语义加固 - 2026-05-28

**目标**：按第二轮 review 收口 v1.1 表单提交、字段值脱敏、provider prompt/trace、content RPC 授权、stream cancel、manifest 权限和工具输入错误语义。

**设计决策**：verify failed 策略统一为“默认阻断自动提交，但用户可通过 high-risk approval 继续”；approval 后先重新 verify 当前 DOM，若原审批是通过态但当前失败则标记 stale，若原审批已明确 `verifyFailed` 则允许高风险继续提交。表单值在 ToolResult/trace/provider context 中只保留 presence/masked 信息，真实值只留在 UI reveal 的内存态。表单 mutation RPC 与 iframe action 一样使用一次性 token。

**偏差说明**：没有在本轮重构整个 `RunLifecycleService` 或把 RecoveryPolicy 完整接成自动恢复闭环；这两项属于较大架构迁移。本轮先修真实安全边界和可验证行为，并把 `StartRunInput.goal/successCriteria`、typed `RuntimeEvent`、provider abort、wait stable、iframe/viewport invalid id 等低风险结构问题补齐。

**权衡分析**：
- 方案一：把所有 review 架构建议一次性重构。优点是概念最统一；缺点是会大幅扩大回归面，尤其影响 extension runtime/E2E。
- 方案二：先落地安全语义、脱敏、授权、abort、manifest/audit 与测试覆盖，再保留大重构为后续任务。优点是风险可控且当前产品可信度明显提升；缺点是生命周期服务仍然偏重。
- 选择方案二，因为本轮目标是“不管 P 几都修真实问题”，但需要保护已通过的 v1.1 主链路。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：135 个文件通过 / 838 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个 E2E 全部通过。
- `npm audit --omit=dev --json` 通过：0 vulnerabilities。

**待确认**：
- [ ] 是否把 `RunLifecycleService` 拆成 `FormAssistService` / `LongPageReadService` / `DiagnosticOrchestrator` 作为下一轮纯架构重构？

## Ask/Act 模式收敛与内部表单策略 - 2026-05-27

**目标**：把用户主入口从四种模式收敛为 `询问 / Ask` 与 `执行 / Act`，同时保留 `form/debug` 作为内部协议能力；修复“帮我回复下...”这类执行意图不会自动填入表单的问题。

**设计决策**：主输入框只暴露 Ask/Act。Ask 永远只读，不做自动填表；Act 可以在内部调用表单策略，但只允许低敏、高置信、空字段的填写与验证，不自动点击发送、提交、发布等最终动作。`form/debug` 继续保留在 schema/runtime 中，避免破坏已有工具路由、trace 和高级调试面板。

**偏差说明**：本次没有把最终提交确认重做成新的内联问答卡审批流；现阶段先收敛主入口和自动填入边界，继续沿用既有高风险 approval 机制保护最终提交。

**权衡分析**：
- 方案一：彻底删除 `form/debug`。优点是概念最干净；缺点是会破坏现有 runtime、测试和高级调试工具面。
- 方案二：UI 收敛为 Ask/Act，内部保留 `form/debug`。优点是用户心智简单，兼容成本低；缺点是代码里仍需明确区分产品模式和内部策略。
- 选择方案二，因为这能最快解决主入口混乱和回复填表不触发的问题，同时不拆掉 v1.1 已验证的表单工具链。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：131 个文件通过 / 800 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个 E2E 通过。

**待确认**：
- [ ] 是否继续把最终提交/发送确认做成消息流里的内联确认卡，而不是沿用当前 approval drawer。

## v1.1 Assisted Form Fill & Debug 实现 - 2026-05-27

**目标**：实现 v1.1 表单执行主路径（observe → read fields → infer fill plan → fill many → verify → submit approval → submit → observe result）。

**已完成的硬核心交付物**：

### Phase 1: Schemas & Contracts ✅
- `src/shared/schemas/form-fill.schema.ts` — 16 个新 schema（FillPlan, FillTarget, FillFieldResult, FillManyResult, FormVerifyResult, SubmitApprovalPayload, SubmitResult 等）
- `src/shared/constants/error-codes.ts` — 13 个新错误码（3503-3515）
- `src/shared/constants/tool-names.ts` — 5 个新工具名
- `src/shared/constants/event-names.ts` — 4 个 RPC 消息名 + 6 个 trace event 名
- `tests/node/shared/schemas/form-fill.test.ts` — 14 个 schema 测试

### Phase 2: Page DOM Form Capabilities ✅
- `src/page/dom/form-fill-dom.ts` (812 行) — 字段可写元数据、合成表单检测、setFieldText/setSelectOption/setCheckboxState 等 helper、fillSingleField/fillManyFields、verifyForm、executeSubmit（优先 button click，fallback Enter，不直接调 form.submit()）、observeSubmitResult
- `src/page/dom/form-reader.ts` — FIELD_SELECTOR 扩展至 contenteditable，snapshot 加 writable 元数据
- `src/shared/schemas/structured-page-data.schema.ts` — fieldWritabilityMetaSchema
- `tests/dom/page/dom/form-fill-dom.test.ts` — 42 个 DOM 测试全覆盖

### Phase 3: Form Tools ✅
- `src/tools/form/bh-form-infer-fill-plan.ts` — 纯推断工具，label/type/placeholder 模糊匹配
- `src/tools/form/bh-form-fill-field.ts` — 单字段填写，RPC 调用 content script
- `src/tools/form/bh-form-fill-many.ts` — 批量填写，partial success
- `src/tools/form/bh-form-verify.ts` — 验证工具，HTML5 validity + visible errors
- `src/tools/form/bh-form-submit-with-approval.ts` — 高风控提交审批，返回 APPROVAL_REQUIRED
- `src/page/messaging/content-rpc-schema.ts` — 4 个新 RPC message types
- `src/page/messaging/content-rpc-handler.ts` — 4 个新 handler cases

### Phase 4: Runtime/Agent/Policy/Trace ✅
- `src/shared/schemas/trace.schema.ts` — 6 个新 trace event schemas（fill_plan_created, field_fill_started, field_fill_result, form_verify_result, submit_approval_requested, form_submit_result）
- `src/agent/recovery/recovery-policy.ts` — 扩展至 v1.1 错误码（FORM_VERIFY_FAILED, SUBMIT_RESULT_UNKNOWN, FILL_RETRY_EXHAUSTED）
- `src/agent/prompts/system-prompt.ts` — Form mode 下指导 v1.1 表单流程

### 验证结果
- `npm run typecheck` — 0 错
- `npm test` — 107 文件通过 / 507 测试通过 / 2 跳过

### 设计决策
- **字段赋值走 RPC**：工具调用 content-rpc → content-script 内 form-fill-dom 执行，保证在目标页面上下文中操作 DOM
- **不逐字段确认，提交必确认**：fill 阶段 medium risk，submit 阶段 high risk + APPROVAL_REQUIRED
- **Submit 走用户路径**：优先 button click，fallback Enter keydown，绝不直接调 form.submit()
- **Submit result 三态**：success / failure / unknown，unknown 不假装成功

### 偏差说明
无重大偏差。Phase 5-7（Debug 抽屉 UI、E2E fixtures、截图验收）需要 Chrome for Testing 环境，不在纯单元测试范围内。

### 待确认
- [ ] E2E fixture 参考 `tests/e2e/fixtures/basic-form.html` 是否要新增 v1.1 专用 fixture
- [ ] 侧面板 submit approval card 的 UI 设计 (`docs/design/v1.1-assisted-form-fill-and-debug/01-assisted-form-fill-debug-ui.png`)
- [ ] README 工具表更新

## v1.1 Review 修复 - 2026-05-27

**目标**：全量 review 已完成的 v1.1 表单填写与 Debug 功能，修复实现、UI、trace 和测试缺口。

**设计决策**：保留“普通字段直接填写、真实提交必须审批”的产品边界；提交审批 UI 使用表单专用摘要卡，默认遮罩字段值，并通过眼睛按钮显示/隐藏非敏感字段预览。

**偏差说明**：原实现已有 v1.1 主体，但 runtime 审批通过后没有执行真实 submit、Debug 表单 tab 缺少生命周期事件、提交审批抽屉仍是通用 JSON 视图；本次补齐为真实 submit + post-submit observe、专用审批卡和 form lifecycle trace。

**权衡分析**：
- 方案一：审批请求内部保留 reveal 所需字段预览，trace 只写脱敏副本。优点：UI 可用且 Debug 不泄露工具参数；缺点：runtime pending state 仍需谨慎处理。
- 方案二：审批请求全量脱敏。优点：内部状态更保守；缺点：眼睛 reveal 无法显示用户需要确认的非敏感值。
- 选择方案一，因为：v1.1 明确要求提交前可检查字段值，同时 Debug/trace/下载链路应默认脱敏。

**待确认**：
- [ ] 是否需要把用户任务文本里的显式字段值也从 `run_started` trace 中脱敏？

## v1.1 Review 收口补强 - 2026-05-27

**目标**：按 v1.1 tasks 逐项复核实现与测试证据，补齐字段修改流程、真实提交 E2E、verify 失败仍提交审批和测试类型契约。

**设计决策**：Submit Approval Card 的字段修改不重启整轮任务，而是通过 side panel 调用 runtime `executeTool` 依次执行 `bh_form_fill_field`、`bh_form_verify`、`bh_form_submit_with_approval`，生成新的审批请求供用户确认。

**偏差说明**：审计发现 6.3 缺少真实 UI 入口，7.2-7.4 缺少覆盖完整 fill → verify → approval → submit → Debug trace 的 E2E；本次补齐 UI、runtime port、fixture、flow/spec，并修复 content verify 未解析 `submitRefId` 导致 submitAvailable 误判的问题。

**权衡分析**：
- 方案一：把字段修改做在现有 approval drawer 内。优点：用户仍处在提交确认上下文，不需要额外 dialog；缺点：drawer 组件需要处理 draft/apply/error 状态。
- 方案二：新增独立编辑 dialog。优点：交互空间更大；缺点：本轮明确先不做 dialog，且会扩大 UI 面。
- 选择方案一，因为：符合“先不做 dialog”和“debugpanel 保持默认不展开”的范围约束。

**验证结果**：
- `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、`npm run test:e2e` 全部通过。
- `npx openspec validate --all --strict` 与 `npx openspec validate implement-v1-1-assisted-form-fill-debug --strict` 通过。
- E2E 覆盖成功提交、verify 失败仍提交审批、Debug drawer Form/Debug trace、审批值遮罩/显示和 redaction。

**待确认**：
- [ ] 是否需要把用户任务文本里的显式字段值也从 `run_started` trace 中脱敏？

## 恢复 v1.0.2 iframe/page read 工具面 - 2026-05-27

**目标**：修复当前构建中 `bh_page_read_visible_text`、`bh_page_read_article`、`bh_iframe_list`、iframe 文档读取和 viewport scroll 工具缺失/不可路由的问题，确保 v1.0.2 长页面与 iframe 读取能力在真实 Chrome extension runtime 中可用。

**设计决策**：选择在现有 content RPC 和工具自动注册体系上补齐 page read / iframe list / viewport tools，而不是重写 AgentLoop。Agent 语义统一使用 iframe/iframeId；底层 runtime 仍使用 Chrome frameId 作为技术路由标识。

**偏差说明**：旧 `bh_iframe_read` 测试仍按 v0.33 的 iframe ref target 语义断言 Ask 不可见；本次按 v1.0.2 决策更新为 Ask 可见，同时保留 ref target 兼容路径。

**权衡分析**：
- 方案一：只修 UI/快捷键，不补工具面。优点是改动小；缺点是 1.0.2 长页/iframe 真实能力仍缺失。
- 方案二：补齐工具与 content RPC 路由。优点是符合 v1.0.2/1.1 决策并能真实验证；缺点是触及 runtime tool surface。
- 选择方案二，因为真实 SOP 验证已证明缺口在工具注册和 frame routing，而不是单纯 UI。

**待确认**：
- [ ] 后续是否要按 roadmap 严格删除旧 `bh_frame_list` / `bh_iframe_click` / `bh_iframe_type`，还是继续保留作为 v0.33 兼容工具。

## 侧边栏回归复核与问答卡片防回归 - 2026-05-27

**目标**：按昨晚 bug 清单复核右侧浮动入口、快捷键、页面观察问答卡、发消息、表单修改、trace/debug 和完成态目标展示是否复现，并修复当前确认的回归点。

**设计决策**：页面观察卡作为当前页面状态的产品级卡片，只要 run snapshot 有 observation/structuredPageData 且消息流缺少 `page_summary`，UI 就兜底派生一张问答卡；不再把页面卡片绑定到“runtime messages 为空”这个偶然条件。运行中状态使用独立 progress card 展示具体动作、loading 和读秒，避免泛化为“AgentLoop 正在读取”。

**偏差说明**：真实 SOP 验证显示浮动 icon、图片、点击展开、快捷键、发消息和表单修改在 Chrome for Testing 中可用；本次主要修复的是页面卡片缺失防回归、运行中体验、完成后仍显示“当前 run 可修改目标”、工具状态文案和 E2E POM 对新 UI 的断言方式。

**权衡分析**：
- 方案一：只修当前截图里的卡片显示。优点是改动小；缺点是 runtime 消息一旦缺少 `page_summary` 仍会复现。
- 方案二：在 UI 层以 snapshot 为权威兜底生成页面卡片，并补测试。优点是对后续 runtime 消息变化更稳；缺点是组件需要更清楚地区分可见摘要与 raw data。
- 选择方案二，因为页面观察卡是产品稳定入口，应由当前 snapshot 保证，而不是依赖某个消息生成路径。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：121 个文件通过 / 675 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：17 个 E2E 全部通过。
- Chrome for Testing 真实验证：浮动 icon 图片加载、点击展开、`Alt/Opt+Shift+B` 收起、自动页面观察卡、发送 Ask 任务、Form 模式填写 email 和 checkbox 均通过。

**待确认**：
- [ ] 系统 Chrome 已安装的扩展是否加载了最新 `.output/chrome-mv3` 构建；如果用户当前浏览器仍复现，优先确认是否是旧构建未 reload。

## 长页面续读与元素定位回归修复 - 2026-05-27

**目标**：修复长文章页面只做一次 `bh_page_observe` 导致正文截断、无法总结的问题；修复可折叠高级调试抽屉中“元素与表单”点击不触发页面定位/高亮的问题。

**设计决策**：在 `ask` 模式中，如果初始 observation 带有 `VISIBLE_TEXT_TRUNCATED`，runtime 会在 provider 回复前自动调用 `bh_page_read_article`，最多读取 3 段正文并把合并正文作为 provider prompt 的补充上下文。元素定位修复为透传 `AdvancedDebugDrawer` 的 `onInspectElement`，不改变 `AdvancedDebugPanel` 的已有 API。

**偏差说明**：没有把 ask 模式改成完整 AgentLoop。原因是 v1.0.2 当前 runtime 架构仍是“observe + provider response”，本次先修最影响长页面总结的确定性断点，避免扩大模型决策循环范围。

**权衡分析**：
- 方案一：让所有 ask 任务进入完整 AgentLoop。优点是能力统一；缺点是风险大，会影响 provider streaming、工具审批和上下文压缩。
- 方案二：只在截断页面做 deterministic article read。优点是改动小、可测试、对长文页立即有效；缺点是最多读取 3 段，仍不是无限全文抓取。
- 选择方案二，因为本次目标是修复 Anthropic 长页面这类实际失败路径，并保持 v1.0.1/v1.0.2 已有 runtime 边界稳定。

**待确认**：
- [ ] 是否需要把 3 段 / 36k 字符上限暴露为设置？
- [ ] 是否需要在系统 Chrome 开发态增加自动 reload 提示，避免旧 side panel bundle 造成“昨天修过今天又没了”的误判？

## 侧边栏回归加固与 E2E 补全 - 2026-05-27

**目标**：把昨晚已修复但今天复现的侧边栏问题做成防回归保护，重点覆盖页面观察卡、长页面正文续读、streaming 合并显示、元素与表单定位高亮，以及旧“已完成页面读取/观察”状态卡复活的问题。

**设计决策**：完成态页面观察不再保留临时 observe status 卡，而是移除临时状态并以 `page_summary` / 问答卡片作为唯一用户可见完成结果。长页面 E2E 使用本地 OpenAI-compatible streaming mock，真实加载 Chrome extension 并验证 `bh_page_read_article`、streaming trace、最终回复卡片同时存在。元素与表单列表项增加明确 aria label，E2E 精确点击目标元素行，避免误点包含“阻止提交”的敏感字段行。

**偏差说明**：本次没有改动原生 Chrome 右侧 side panel 宿主的最终人工验收路径；自动化验证仍按项目 SOP 使用 Chrome for Testing 的 side panel debug tab。原因是这条路径能稳定加载 unpacked extension、断言 runtime/content RPC 和页面 DOM 高亮。

**权衡分析**：
- 方案一：只补 UI 快照或组件单测。优点是快；缺点是无法覆盖真实 extension runtime、content script、provider streaming 和页面 DOM 高亮。
- 方案二：补单测、DOM 测试和真实 E2E。优点是覆盖昨天回归的完整链路；缺点是 E2E 数量增加，运行时间略增。
- 选择方案二，因为这些问题都是跨 runtime/UI/content 的集成回归，只靠组件测试很容易漏掉。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：122 个文件通过 / 679 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：19 个 E2E 全部通过。

**待确认**：
- [ ] 是否要把 `127.0.0.1` loopback provider 仅限测试构建，还是保留为本地模型/代理开发的正式支持能力？

## v1.1.1 安全与 runtime 语义继续加固 - 2026-05-28

**目标**：收口第二轮 review 中剩余的 runtime 语义、架构命名、权限、provider、ToolSelector、metrics 和稳定等待问题。

**设计决策**：内部 run 入口采用 `runKind: observe_only | diagnose | answer | form_assist`；ToolSelector 移到 `src/tools/core/tool-selector.ts`，按 mode、capability、pending approval、domain policy、page state 和 risk 裁剪工具；内部诊断命名改为 `DeterministicDiagnosticModelClient` / `runDeterministicDiagnostics`；`RunLifecycleService` 拆出 `FormAssistService` 和 `LongPageReadService`；本地 provider endpoint 增加 UI 明示和 `allowLocalProviderEndpoints` 设置；provider trace/snapshot 记录 token 估算和未定价 cost 状态；content script 默认匹配收窄为 http/https；`PAGE_WAIT_UNTIL_STABLE` 在 DOM quiet 后额外等待 layout frames 和 fonts readiness。

**偏差说明**：没有引入真实 provider 价格表做 cost 计算，当前记录 `costUsdEstimate: null` 和 `costEstimateStatus: "unpriced"`。原因是不同 OpenAI-compatible endpoint 价格不可由 baseUrl/model 稳定推断，错误金额比显式未定价更危险。

**权衡分析**：
- 方案一：一次性重写 runtime agent core。优点是概念更纯；缺点是会冲击已通过的 extension/runtime/E2E 主链路。
- 方案二：在现有主链路上拆分服务、强化类型边界并补行为测试。优点是风险可控，能逐项关闭 review 问题；缺点是需要逐步替换旧调用点。
- 选择方案二，因为当前阶段目标是 hardening 和语义收口，而不是重写 agent kernel。

**待确认**：
- [ ] 后续是否接入 provider/model 价格配置，让 `costUsdEstimate` 从 unpriced 变成可选精确估算。

## 第二轮 review 剩余项收口 - 2026-05-28

**目标**：继续修复第二轮 review 中尚未完全落地的恢复闭环、Debug 能力边界、敏感域注入边界和表单 DOM 模块边界。

**设计决策**：Runtime 工具恢复不再只设置 snapshot，而是统一写入 `recovery_action` trace；`repair_tool_args` 只做确定性安全转换（如字符串数字/布尔值），无法确定时进入 `waiting_for_user`；`find_alternative_ref` 先重新观察页面，并且只有在 role/name 明确匹配时才替换 ref 重试。Debug UI 显示“浅层 Debug / CDP 不可用”，避免用户误认为当前已经具备 DevTools/CDP 深度能力。表单 DOM 层先拆出类型、可写性判断和合成表单检测，保留原 `form-fill-dom.ts` 作为兼容出口。TaskClassifier 对“表单 + 提交/发送/删除”等混合任务保留 `actionIntent` 和 `requiresApproval`，避免 mode 保守降级时丢失动作语义。

**偏差说明**：没有把 Debug 升级为 CDP deep inspector。该能力属于 roadmap 中 v1.3 范围；本轮先把浅层能力边界显式展示，并继续收口 runtime 语义。

**权衡分析**：
- 方案一：对恢复策略引入完整模型修参循环。优点：概念上更接近 tool-using agent；缺点：当前 runtime 主链不是完整 AgentLoop，贸然接入会扩大 provider/approval 风险。
- 方案二：实现一轮确定性恢复和明确的人类接管状态。优点：可测试、可审计、不伪造参数；缺点：复杂修参仍需用户或后续 AgentLoop 接管。
- 选择方案二，因为本轮目标是补齐可信恢复语义，而不是让 runtime 猜测缺失信息。

**验证结果**：
- `npm test -- tests/node/runtime/run/tools/tool-execution-service.test.ts` 通过。
- `npm test -- tests/node/ui/components/agent-components.test.tsx tests/node/tools/debug/debug-tools.test.ts tests/dom/page/dom/page-health-reader.test.ts` 通过。
- `npm test -- tests/dom/page/dom/form-fill-dom.test.ts` 通过。
- `npm run typecheck` 通过。

**待确认**：
- [ ] 是否把 Debug/CDP deep inspector 明确排入 v1.3 变更，而不是继续混在 v1.1 hardening 中。

## 第二轮 review 语义硬化续修 - 2026-05-28

**目标**：继续收口剩余的 domain policy、runtime event、run kind、debug hook 和 lifecycle 职责边界。

**设计决策**：新增 `BrowserHelmDomainPolicy` 存储契约，content script 和 dynamic injection 都通过同一套 `evaluateBrowserHelmDomainPolicy()` 判定；普通 http/https 默认启用，显式 enabled list 会切换为 allow-list 模式，blocked list 优先拒绝，banking/payment/medical 等 restricted 域名必须显式 `allowRestrictedDomains` 才能运行。移除旧的 provider-skip 布尔入口，统一使用 `runKind`。`runtimeEventSchema` 改为按 `type` 分支的 discriminated union，并要求 payload 为对象形元数据。Debug bridge 在页面主上下文注入 console/window error、console debug/info/log/warn、fetch/XHR hook，将浅层信号发回 content script。Goal revision 拆出 `GoalRevisionService`，让 lifecycle service 不再直接维护 revise-goal 状态更新。

Manifest 默认 host 权限也同步收口：`host_permissions` 为空，`http://*/*`、`https://*/*` 和 `<all_urls>` 只保留在 `optional_host_permissions` 中；运行时依靠 `activeTab`、用户授权的 optional host permission 与 domain policy 共同控制页面注入边界。

**偏差说明**：RuntimeEvent 的 TypeScript 事件对象仍允许自定义字符串事件，原因是现有内部 trace 工具和测试 helper 仍会构造非 schema 事件；真正跨 runtime port 的校验以 `runtimeEventSchema` 为准，未知事件会被拒绝。

**权衡分析**：
- 方案一：默认禁用所有域名，必须用户逐域开启。优点：最小权限；缺点：会破坏当前 content script 自动观察和本地 E2E 主路径。
- 方案二：普通域名默认启用，支持 allow-list/block-list/restricted override。优点：兼容当前产品体验，同时具备显式按域收口能力；缺点：不是最严格的发布默认值。
- 选择方案二，因为 BrowserHelm 当前还是开发态原型，既要保住稳定验证路径，也要把可配置安全边界落到代码。

**验证结果**：
- `npm test -- tests/node/entrypoints/content-config.test.ts tests/node/shared/domain-policy.test.ts tests/node/page/messaging/content-rpc-client.test.ts tests/node/ui/stores/settings-store.test.ts` 通过。
- `npm test -- tests/node/runtime/runtime-messages.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts tests/node/runtime/run/runtime-event-utils.test.ts tests/node/runtime/run/run-store.test.ts tests/node/runtime/run/streaming-state.test.ts` 通过。
- `npm test -- tests/node/runtime/run/goal-revision-service.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts` 通过。
- `npm run typecheck` 通过。
- 全量收口验证：`npm run typecheck`、`npm run lint`、`npm run build`、`npm test`、`npm run test:e2e`、`npm audit --omit=dev --json` 均通过；Vitest 为 137 个文件通过 / 865 个测试通过 / 1 个文件跳过 / 1 个测试跳过，E2E 为 41 个场景通过，依赖审计 0 漏洞。
- 漏项扫描：`skipProviderResponse` 已无残留；manifest 产物中 `host_permissions` 为空；伪造默认邮箱/手机号仅保留在负向断言测试中；Markdown 渲染仍使用 `dangerouslySetInnerHTML`，但入口已先经过本地 allowlist sanitizer。

**待确认**：
- [ ] 正式发布构建是否要把 `defaultEnabled` 默认改为 false，并要求用户逐域启用。

## 移除旧标记与兼容别名 - 2026-05-28

**目标**：按反馈移除代码和文档里的旧接口标记；旧接口既然不用，就直接删除，不再以兼容形式保留。

**设计决策**：删除 `RuntimeDiagnosticModelClient` 和 `enrichSnapshotWithDiagnostics` 两个旧兼容导出，只保留当前名称 `DeterministicDiagnosticModelClient` 与 `runDeterministicDiagnostics`。文档里的旧工具表述统一改为“已删除/不保留兼容工具”。测试中的旧选项样例改成普通 warning 文案。

**偏差说明**：没有删除历史 archive 文档本身，只移除了其中的旧接口标记表述；这些 archive 仍保留 v1.0.2 的决策记录。

**验证结果**：
- 旧接口标记关键词全仓库扫描无匹配。
- `npm test -- tests/dom/page/dom/page-health-reader.test.ts tests/node/runtime/runtime-diagnostic-model-client.test.ts tests/node/runtime/run/run-lifecycle-service.test.ts` 通过：3 个文件 / 14 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 无。

## AgentLoop 跨步重复填写修复 - 2026-05-28

**目标**：修复模型在字段已成功填写后，中间插入 `bh_form_read_fields`，随后再次调用同一批字段填写，导致“姓名已填还继续执行很多后续操作”的循环问题。

**设计决策**：采用“模型决定结束、runtime 约束重复”的方案。runtime 不在填写成功后自动结束 run，而是把最近工具动作摘要放入下一轮 prompt，让模型看到本轮已完成的工具、字段 refs 和结果；同时 runtime 检测同一 run 内相同字段 refs 的重复 `bh_form_fill_many` / `bh_form_verify`，即使中间穿插了读取工具也会拦截。首次重复进入 repair，引导模型在 `finish` 和针对已填字段的 `bh_form_verify` 之间选择。

**偏差说明**：没有实现全局通用循环检测器，也没有把成功填写直接转成 finish。当前只对表单填写和验证这两个真实暴露问题的动作做跨步重复保护；后续如果点击、滚动等动作出现类似循环，再扩展为通用 recent action detector。

**权衡分析**：
- 方案一：填写成功后 runtime 自动结束。优点是能马上止住循环；缺点是背离 AgentLoop 由模型做终止判断的设计，也可能误杀后续验证/多步骤任务。
- 方案二：只加强 prompt。优点是最轻；缺点是模型仍可能在 `fill -> read -> fill` 里绕过上一工具检查。
- 方案三：给模型动作历史，同时由 runtime 跨步拦截同字段重复动作。优点是模型仍负责 `finish`，runtime 只兜底防重复；缺点是目前先聚焦表单动作。
- 选择方案三，因为它最接近 Sarathi 的动作历史和 WebBrain 的重复纠偏思路。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts -t "read fields call happened"` 先失败后通过，覆盖 `fill -> read_fields -> fill` 不再执行第二次填写。
- `npm test -- tests/node/runtime/run-manager.test.ts -t "successful form fill|successful form verification|repeated form fill|repeated form verify|already has a value|existing value|overwrite"` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过：57 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 后续是否把同类重复检测扩展到点击、滚动、读取等其它工具。

## AgentLoop TaskState 维护 - 2026-05-28

**目标**：在 AgentLoop prompt 中加入类似“当前任务状态”的结构化状态，让模型每轮知道目标、已完成、还剩什么，同时允许模型随每个决策提交 `taskStateUpdate`。

**设计决策**：`taskState` 采用双来源维护：模型可以在任意 `tool_call` / `finish` / `ask_user` / `fail` 决策里带 `taskStateUpdate` 更新 goal、completed、remaining、recommendedNextDecision 和 reason；runtime 只从真实工具结果写入可信事实，例如已填写/已验证的 field refs。prompt 明确说明 runtime facts 优先于模型备注，避免模型没更新或更新错时污染真实执行状态。

**偏差说明**：本次没有做完整的用户可见 todo UI，也没有把 taskState 做成通用规划引擎。它先作为 provider prompt 的稳定上下文和 runtime snapshot 的调试字段存在。

**权衡分析**：
- 方案一：完全让模型维护 taskState。优点是灵活；缺点是容易漏更新或写错。
- 方案二：完全由 runtime 推断 taskState。优点是可信；缺点是难理解复杂自然语言任务。
- 方案三：模型维护任务备注，runtime 维护工具事实，并声明 runtime facts 覆盖模型备注。优点是既能让模型持续更新，又能防止错误状态覆盖真实执行。
- 选择方案三，因为它和当前“模型决定结束、runtime 防重复”的边界一致。

**验证结果**：
- `npm test -- tests/node/agent/parser/decision-parser.test.ts -t "taskStateUpdate"` 先失败后通过，覆盖决策解析不再丢失 `taskStateUpdate`。
- `npm test -- tests/node/runtime/run-manager.test.ts -t "task state updates"` 先失败后通过，覆盖下一轮 prompt 包含模型状态、runtime 填写事实和 `runtimeFactsOverrideModelNotes`。
- `npm test -- tests/node/agent/parser/decision-parser.test.ts tests/node/shared/schemas/agent-decision.test.ts tests/node/runtime/run-manager.test.ts` 通过：74 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 后续是否把 taskState 展示到 debug drawer 或主 UI 的折叠详情里。

## Extension Dev CSP Inline Script 防护 - 2026-05-28

**目标**：修复扩展页在 Chrome MV3 CSP 下出现 `Executing inline script violates ... unsafe-inline` 的控制台报错。

**设计决策**：在 `wxt.config.ts` 中关闭 Vite HMR，避免 React Fast Refresh 在扩展页注入内联 preamble；同时加入 `strip-inline-scripts` Vite HTML transform，作为最终防线移除所有没有 `src` 的 `<script>`。Chrome MV3 extension_pages 不接受 inline script，因此扩展入口 HTML 必须只保留外部脚本。

**偏差说明**：当前 production/dev 产物和真实 Chromium 扩展加载未复现用户粘贴的 CSP 报错；本次按最可能的 dev/watch 注入路径做防护，并用静态扫描和真实扩展 smoke 验证。

**权衡分析**：
- 方案一：放宽 CSP。缺点是 MV3 extension_pages 不能靠 `unsafe-inline` 解决，且会降低安全性。
- 方案二：移除扩展 HTML 内联脚本并关闭 dev HMR。缺点是 dev 热更新能力减弱；优点是符合 MV3 CSP，也是最稳定的扩展运行方式。
- 选择方案二，因为扩展页本来就应该完全避免 inline script。

**验证结果**：
- `npm test -- tests/node/config/wxt-config.test.ts tests/node/entrypoints/content-config.test.ts` 通过：2 个文件 / 8 个测试。
- `npm run build` 通过。
- production `.output/chrome-mv3/{landing,options,sidepanel}.html` 扫描：inline script tags 均为 0。
- dev `.output/chrome-mv3-dev/{landing,options,sidepanel}.html` 扫描：inline script tags 均为 0，React Refresh preamble 均为 false。
- 使用 Chrome for Testing / unpacked extension 打开 `https://account.apple.com/account` 和 `https://www.zhihu.com/`，再打开扩展 sidepanel，监听 console/pageerror：CSP/unsafe-inline 命中为 0。
- `npm run test:e2e`：40 passed / 4 skipped / 1 failed；失败项为 `sidepanel.html?tabId=...` 偶发 `ERR_FILE_NOT_FOUND`，单独复跑该用例通过，不是 CSP 命中。

**待确认**：
- [ ] 若后续仍在旧 extension id 上看到同样 CSP 报错，优先确认 Chrome 当前加载的是最新 `.output/chrome-mv3-dev` 或 `.output/chrome-mv3`。

## 运行进度卡展示 Trace 阶段 - 2026-05-28

**目标**：修复底部 loading 卡长期显示“AI 正在生成本轮决策，已收到 0 个字符”，用户无法判断 AI 当前在开始输出、生成中、解析失败还是重试的问题。

**设计决策**：`AgentMessageList` 的 thinking progress 改为优先投影最新 trace 阶段：`model_stream_started` 显示“开始生成回复 / 模型开始输出”，连续 `model_stream_delta` 汇总为“生成中 / 已收到 N 个片段，约 M 字符”，`model_stream_finished` 显示“回复生成完成”，`decision_parse_failed` 显示事件名和 payload 字段摘要。字段填写后的确认态仍优先展示“正在确认已填写内容”，避免表单任务回退成泛化模型状态。

**偏差说明**：底部卡片仍不展示模型原始 token 内容，只展示 trace 标题和安全摘要；原始 payload 继续在“查看原始详情”里展开。

**权衡分析**：
- 方案一：直接把模型输出文本放到底部 loading 卡。优点是最直观；缺点是 BrowserHelm 的模型输出常是内部 JSON 决策，直接展示会泄漏协议细节。
- 方案二：复用 trace 阶段标题和摘要。优点是和调试流一致，能说明 AI 当前在干嘛，同时不暴露内部决策原文；缺点是仍需要用户点开 trace 看完整 payload。
- 选择方案二，因为用户要的是“知道 AI 在干嘛”，而不是看到未解析的内部协议。

**验证结果**：
- `npm test -- tests/dom/ui/qa-card.test.tsx -t "模型刚开始输出|模型输出片段|解析失败|model streaming 进度卡"` 先失败后通过。
- `npm test -- tests/dom/ui/qa-card.test.tsx` 通过：26 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。

**待确认**：
- [ ] 是否要继续把 `decision_parse_failed` 这类英文 trace type 本地化成“决策解析失败”。

## Agent Loop 收尾与真实站 SOP 修复 - 2026-05-28

**目标**：修复 Apple / 知乎真实页面中 AI 决策结束后仍 loading、原始 JSON 决策外露、字段已有值报错外露、表单计划参数错误外露，以及 trace 缺 timestamp 导致进度计时长期显示 0s 的问题。

**设计决策**：模型返回不支持的 `type: "multi"` envelope 时不执行其中批量动作，也不相信其 `finish` 文案，而是规范化为 `ask_user` 让用户明确下一步；所有带 `type` 的 JSON provider 文本都视为内部决策，不渲染成普通 BrowserHelm 回复。`RunStore.appendTrace()` 为缺 timestamp 的 runtime event 补 `Date.now()`。模型请求增加 45s 超时保护，超时后进入可见失败态而不是永久 thinking。字段已有值连续重试时由 runtime 兜底完成，文案说明没有覆盖也没有提交；表单填写计划参数失败卡片改为提示用户提供具体字段值，隐藏内部 tool 名。

**偏差说明**：真实 Apple 页这次 provider 最终走到“字段已有值”兜底完成，而不是实际填写新个人信息；这是安全策略下的预期结果，因为“随便填”不允许编造个人信息。知乎搜索页真实验证返回完成态并显示搜索结果页没有相关内容。

**权衡分析**：
- 方案一：把 `multi.finish.message` 直接当 finish。优点是最少代码；缺点是可能把模型编造的“已填写”展示给用户，且隐藏未执行动作。
- 方案二：把非法 multi 转成需要用户确认，内部 JSON 不展示，runtime 对超时和已有值做兜底收尾。优点是安全、可解释、不再无限 loading；缺点是某些模型违规输出会多一次用户确认。
- 选择方案二，因为 BrowserHelm 应该像正常 agent 一样明确停在完成、等待用户或失败态，而不是展示内部协议残片。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/agent/parser/decision-parser.test.ts tests/node/runtime/run/run-store.test.ts tests/dom/ui/qa-card.test.tsx` 通过：4 个文件 / 96 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 passed / 4 skipped。
- 按扩展调试 SOP 使用 Chrome for Testing 真实打开 `https://account.apple.com/account`：最终状态为“完成”，spinner 停止，无 raw JSON、无“运行出错”、无内部参数错误；最终回复“相关字段已有值，我没有覆盖已有输入，也没有提交表单。” 截图：`/tmp/browserhelm-apple-final-sop-2.png`。
- 按扩展调试 SOP 使用 Chrome for Testing 真实打开知乎搜索页：任务 `帮我搜索下“最近的 agent 文章”，不要提交` 在 5s 内完成，spinner 停止，无 raw JSON / 内部错误；最终回复说明未搜索到相关内容。截图：`/tmp/browserhelm-zhihu-final-sop.png`。

**待确认**：
- [ ] 是否把 45s provider 超时做成用户可配置项。

## 统一主 Runtime AgentLoop - 2026-05-28

**目标**：删除旧的 provider answer、deterministic diagnostic、FormAssist/LongPage 独立编排路径，把 Ask/Act/Form/Debug 主运行统一到一个 JSON AgentDecision tool-calling loop，并修复真实 Google 首页无法自动填写的问题。

**设计决策**：新增 `UnifiedRuntimeAgentLoop` 作为主 runtime 决策器：每轮 provider 只能返回 `tool_call` / `finish` / `ask_user` / `fail`，工具执行统一走 `ToolExecutionService`、policy、approval 和 trace。Act 模式允许使用 Form 工具，但 `bh_form_fill_many` 有 runtime guard：字段必须来自当前观察结果，目标字段必须可写、非敏感、非隐藏/文件、未填充，value 必须是用户任务中的显式子串。content script 保持单例 `ContentRpcHandler`，确保 ref map 和一次性 action token 不跨消息丢失。表单 submit approval 后重新 verify/readiness，并为真实 submit 获取新的 runtime action token。

**偏差说明**：不保留兼容旧 runtime 服务，旧 `ProviderResponseService`、`FormAssistService`、`LongPageReadService`、`RuntimeDiagnosticModelClient` 已删除。E2E mock provider 改为返回统一 AgentDecision JSON，而不是旧的自由文本流。真实 provider 里出现的 `{ tool_call: {...} }` wrapper 和可安全转换的 `bh_form_fill`/`formFields` 旧形状在 parser 层规范化，避免真实模型轻微格式偏差直接中断。

**权衡分析**：
- 方案一：保留旧 deterministic 链路并在外层桥接 unified loop。优点是短期兼容；缺点是继续存在两套 agent 语义。
- 方案二：直接删除旧链路，只保留统一 loop。优点是 runtime/trace/tool/approval 语义一致；缺点是需要同步更新 E2E 和 provider mock。
- 选择方案二，因为当前阶段没有兼容包袱，统一语义比保留旧路径更重要。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：137 个文件通过 / 879 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。
- 真实验证：Chrome for Testing headless 加载 `.output/chrome-mv3`，读取 `.env.development` 中真实 DeepSeek provider 配置，打开 `https://www.google.com/ncr`，运行 `帮我搜索 “美国”`；Google 搜索框最终值为 `美国`，最后成功工具为 `bh_form_fill_many` / `OK`。

**待确认**：
- [ ] 是否要把真实 Google 验证脚本沉淀成可复用 npm script。

## Floating Panel document_start 时序修复 - 2026-05-28

**目标**：修复全量 E2E 中 floating icon 偶发不出现、icon 图片加载断言失败的问题。

**设计决策**：content script 在 `document_start` 执行时，如果 `document.documentElement` 尚未就绪，不再静默放弃安装 floating panel，而是通过 `setTimeout(0)` 和 `DOMContentLoaded` 排队重试；iframe 内仍按 `window.top !== window` 直接跳过，不创建 floating host。

**偏差说明**：没有修改 E2E 断言或放宽超时；修复点放在内容脚本安装时序上。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e -- tests/e2e/specs/extension/floating-panel.spec.ts` 通过：9 个场景。
- `npm run test:e2e` 通过：41 个场景。

**待确认**：
- [ ] 无。

## 页面观察排序、中文自由文本填充与无头 E2E - 2026-05-28

**目标**：修复“已完成页面观察”卡片在同一轮回答中落到最下面的问题；修复 GitHub Dashboard 这类“输入一个『…』”任务只推断不填充的问题；确保 E2E 固定无头执行。

**设计决策**：消息展示层会把同一个 run 的 `page_summary` 固定放到该 run 的用户任务后面、provider 回答和工具状态前面；历史自动观察卡如果没有同 run 用户任务，则保留原顺序，不会被移动到新用户消息后。表单推断增加中文 `输入/填入/填写/键入/打上` 自由文本抽取，并在多个文本框中只选择一个最匹配字段：优先 textarea / ask / message / reply 语义，非搜索任务不再误填搜索框。E2E extension helper 移除 `BROWSER_HELM_E2E_HEADLESS=0` 覆盖，固定 `headless: true`。

**偏差说明**：没有对用户提供的 GitHub 真实页面重新执行外部写入验证；本次根据下载 trace 复现字段结构，并用 RunManager 单测覆盖 `Find a repository…` + `Ask anything or type @ to add context` 的自动填充路径。

**验证结果**：
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：137 个文件 / 868 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。

**待确认**：
- [ ] 无。

## 原生 Side Panel 与页面浮层互斥 - 2026-05-28

**目标**：修复先打开浏览器原生 side panel，再点击页面右侧 BrowserHelm 浮动入口时会同时出现两个驾驶舱 UI 的问题。

**设计决策**：background 维护 side panel port 的 surface 和目标 tab 映射。原生 side panel 连接时不再依赖 `port.sender.tab.id`，而是优先从 side panel URL 的 `tabId` 解析目标页面，解析不到再回退 active tab，并向该 tab 发送 `FLOATING_PANEL_CLOSE`。页面浮动入口点击时不直接在 content script 中调用 `chrome.sidePanel.open`，而是发送 `FLOATING_PANEL_OPEN_NATIVE` 给 background；如果对应 tab 的原生 side panel 已打开，background 直接返回 opened，content script 保持页面浮层关闭。

**偏差说明**：Chrome 可能不接受从 content script 消息链间接触发的 `chrome.sidePanel.open()`，因此页面浮动入口在原生未打开时仍保留 iframe fallback；本次重点保证原生已打开时不会再展开第二个页面内嵌面板。

**权衡分析**：
- 方案一：彻底删除页面内嵌 fallback。优点是不会双开；缺点是当原生 side panel API 不能被程序化打开时，页面入口会失效。
- 方案二：保留 fallback，但用 background 记录原生 side panel 状态并强制互斥。优点是保留旧入口可用性，同时修复双开；缺点是状态同步需要依赖 side panel port 生命周期。
- 选择方案二，因为它修复当前真实 bug，同时不砍掉页面浮动入口的降级能力。

**验证结果**：
- `npm run build` 通过（由 `npm run debug:extension` 执行）。
- SOP 使用 Chrome for Testing / unpacked extension / `BROWSER_HELM_DEBUG_CDP_PORT=9345` 验证：原生 side panel 可见时，再点击页面右侧 floating icon 后，`#browserhelm-floating-entry-host[data-open]` 仍为空，页面内嵌 panel transform 仍为隐藏状态，没有展开第二个面板。
- `npx vitest run tests/node/runtime/side-panel-target.test.ts tests/node/runtime/background-message-guards.test.ts` 通过。
- `npx eslint src/entrypoints/background.ts src/entrypoints/content.ts src/background/runtime/side-panel-target.ts src/background/runtime/background-message-guards.ts src/shared/constants/event-names.ts tests/node/runtime/side-panel-target.test.ts tests/node/runtime/background-message-guards.test.ts src/agent/report/findings-report.ts` 通过。

**待确认**：
- [ ] 后续是否要把页面浮动入口彻底改成只打开原生 side panel，去掉 iframe fallback。

## Ask 执行动作意图拦截 - 2026-05-28

**目标**：修复用户在 Ask 模式下提出输入、回复、填写、搜索等会改变页面的任务时，BrowserHelm 继续执行或生成“已输入”回复的问题。

**设计决策**：在 runtime startRun 早期检查显式 Ask + actionIntent；命中时将 run 停在 `waiting_for_user`，返回“需要切换到执行 / Act”的 recommendation 消息，不观察页面、不调 provider、不触发任何填表工具。任务分类器补充“填写、填入、回复、评论、留言、搜索、选择”等中文输入信号。

**偏差说明**：本次先用消息提示用户切换模式并重新发送，没有新增一个真正的通用“批准切换 mode”交互按钮；这样改动面最小，也符合当前 ChatPanel 已有 Ask/Act 模式选择。

**权衡分析**：
- 方案一：让 Ask 自动升级成 Act。优点是少一步操作；缺点是用户显式选择 Ask 时仍扩大了页面 mutation 权限。
- 方案二：Ask 下检测到动作意图就停下并请求用户切换。优点是权限边界清晰，不会误写页面；缺点是用户需要重新发送一次。
- 选择方案二，因为 Ask/Act 的产品边界就是“读”和“改”的显式授权。

**验证结果**：
- `npx vitest run tests/node/runtime/run-manager.test.ts -t "asks the user to switch to act"` 通过。
- `npx vitest run tests/node/agent/task/task-classifier.test.ts tests/node/agent/modes/mode-system.test.ts` 通过。
- `npm run typecheck` 通过。
- `npm run lint -- src/agent/task/task-classifier.ts src/background/runtime/run/run-lifecycle-service.ts src/i18n/locales/zh.ts src/i18n/locales/en.ts tests/node/runtime/run-manager.test.ts` 通过。

**待确认**：
- [ ] 后续是否要把“切换到 Act 并重发”做成消息里的单击确认按钮。

## 模型辅助表单字段选择 - 2026-05-28

**目标**：降低 `bh_form_infer_fill_plan` 纯本地规则在复杂页面上的误判风险，按 `docs/research.md` 中 WebBrain 风格的“observe first、模型选择工具/目标、mutation 后 verify”思路收口自动填充。

**设计决策**：保留现有工具名和 ToolResult 契约，把 `bh_form_infer_fill_plan` 定位为安全候选生成器；`FormAssistService` 在自动填充前读取 provider 配置，若用户任务中存在显式值，则向 provider 发送脱敏字段候选（ref、label、type、presence、placeholder、ariaLabel）和允许使用的显式值集合，让模型只返回 `{ fieldRefId, value, confidence, reason }`。运行时只接受可写、非敏感、非隐藏/文件、未填充字段，且 value 必须来自用户明确提供的值；provider 缺失、失败、低置信或非法输出时自动回退本地计划。

**偏差说明**：本次没有引入新的表单 planner 工具名，也没有让模型直接执行 DOM mutation；模型只负责选择字段和值，真实填写仍走 `bh_form_fill_many` 和后续 `bh_form_verify`。工具注册仍保留 `import.meta.glob('./**/bh-*.ts')` 动态扫描；为避免 helper 被动态扫描误注册，推断 helper 移到非 `bh-*.ts` 文件中，`bh-form-infer-fill-plan.ts` 只导出工具工厂。

**权衡分析**：
- 方案一：完全重写推断器为模型工具调用 AgentLoop。优点：最贴近 WebBrain；缺点：改动面大，会牵动 runtime 主循环和测试。
- 方案二：保留本地候选，新增 provider planner 只做目标选择。优点：改动小、可回退、不会放大自动写入权限；缺点：仍保留部分本地启发式作为 fallback。
- 选择方案二，因为它能先修复“不靠谱的字段选择”核心问题，同时不破坏现有表单主链。

**验证结果**：
- `npm test -- tests/node/runtime/run-manager.test.ts tests/node/tools/form/form-fill-tools.test.ts` 通过：2 个文件 / 48 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm test` 通过：137 个文件通过 / 869 个测试通过 / 1 个文件跳过 / 1 个测试跳过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。

**待确认**：
- [ ] 后续是否把 provider planner 扩展成正式 `ToolSelector/FormPlanner` 模块，并接入更多页面上下文位置特征。

## 工具描述本地化 - 2026-05-28

**目标**：修复中文界面下 Trace 工具卡仍显示英文工具描述的问题。

**设计决策**：工具说明文案统一进入 `src/i18n/locales/{zh,en}.ts`，新增 `tool.description.*` 翻译 key；`src/i18n/tool-descriptions.ts` 只维护 `ToolName -> TranslationKey` 映射并通过 `t(key, locale)` 取文案。`TraceLog` 使用 `useLocale()` 传入 locale，中文界面显示中文，英文界面保留英文。

**偏差说明**：本次只处理工具说明 UI 文案，不改工具 `ToolSpec.description` 的英文契约；工具契约仍面向 provider/内部注册，UI 展示统一走 i18n 字典。旧的 `src/shared/tool-descriptions.ts` 已删除，避免 UI 文案散落在 shared 层。

**验证结果**：
- `npm test -- tests/node/i18n/tool-descriptions.test.ts tests/node/ui/components/timeline-inspector.test.tsx` 通过：2 个文件 / 7 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 无。

## Act 表单规划去关键词化 - 2026-05-28

**目标**：修复 `帮我搜索“美国”` 这类 Act 任务只得到模型文字建议、没有真实填入的问题，同时避免继续堆中文关键词/正则作为自动执行策略。

**设计决策**：参考 `docs/research.md` 中 WebBrain 的 Ask/Act、observe-first、tool planner 和 verify-first 思路，Act/Form 在页面有表单字段时进入表单候选规划；本地 `bh_form_infer_fill_plan` 只产出安全候选或标记需要 planner，不直接用“搜索”等关键词生成值。provider planner 负责从用户任务和字段语义中选择字段和值；runtime guard 只接受可写、非敏感、未填字段，且写入值必须是用户任务中真实出现过的子串，防止模型编造默认值。填写后仍走 `bh_form_fill_many` 和 `bh_form_verify`。

**偏差说明**：还没有把 provider answer runtime 改成完整 WebBrain 式 function-calling AgentLoop；本次先把 Act 自动填充路径从“关键词触发”改成“候选 + planner + runtime guard”，减少正则扩张。

**验证结果**：
- `npm test -- tests/node/tools/form/form-fill-tools.test.ts tests/node/runtime/run-manager.test.ts` 通过：2 个文件 / 50 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm test` 通过：138 个文件通过 / 874 个测试通过 / 1 个文件跳过 / 1 个测试跳过。

**待确认**：
- [ ] 后续是否把 Act 主链升级为真正的 tool-calling loop，让 provider 直接按 schema 调用 `bh_form_fill_many` / `bh_form_verify`，而不是通过当前 FormAssistService 编排。

## Debug SOP 真实 Provider 配置种子 - 2026-05-28

**目标**：修复按浏览器扩展调试 SOP 启动干净 Chrome for Testing profile 时无法读取用户已配置 provider，导致 Google 首页真实验证只能停在 provider 未配置的问题。

**设计决策**：`scripts/debug-extension.ts` 启动调试会话时读取 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`，并以 `.env.development` 作为默认 dotenv fallback；解析成功后通过扩展 service worker 写入 `chrome.storage.local.providerSettings`。这保持 runtime 产品路径不变：RunManager 仍只读 `ChromeSettingsStore` 中的用户配置；调试脚本只负责把本地开发配置种子到新的调试 profile。可用 `BROWSER_HELM_PROVIDER_ENV` 指定其他 env 文件，或 `BROWSER_HELM_DEBUG_SEED_PROVIDER=0` 禁用种子。

**偏差说明**：浏览器扩展运行时不能直接读取本地文件系统中的 `.env.development`；因此读取 dotenv 放在 Node 调试脚本中完成，再落到扩展真实 storage。没有引入 mock provider，也不会打印 API key。

**验证结果**：
- `npm test -- tests/node/agent/model/provider-config.test.ts tests/node/runtime/run-manager.test.ts tests/node/tools/form/form-fill-tools.test.ts` 通过：3 个文件 / 55 个测试。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- `npm run test:e2e` 通过：41 个无头 E2E 场景。
- 按扩展调试 SOP 使用 Chrome for Testing 打开真实 `https://www.google.com/`，调试脚本从 `.env.development` 种子真实 DeepSeek provider 配置；运行 `帮我搜索 ‘美国’` 后 trace 显示 `bh_form_infer_fill_plan` 使用 provider planner、`bh_form_fill_many` 成功填写 1/1 个字段，Google 搜索框最终值为 `美国`。

**待确认**：
- [ ] 无。

## Ask 模式 trace_31 解析修复去关键词化 - 2026-05-28

**目标**：修复 `/Users/counter/Downloads/browserhelm-trace-run_31-20260528.jsonl` 中模型返回 `{"type":"ask_user","message":"..."}` 被判为 `MODEL_OUTPUT_SCHEMA_INVALID` 的问题，同时撤回“填下 / 随便填 / 模拟填”这类关键词补丁，并停止用 `task-classifier` 的 actionIntent 正则触发 Ask->Act。

**设计决策**：Ask->Act 不再依赖本地 actionIntent 正则；Ask 模式的 prompt 会暴露只读伪工具 `bh_request_act_mode`，模型认为请求会改变页面时用结构化 tool_call 申请切换，runtime 截获后展示同一张“切换到执行并继续 / 保持 Ask”卡片，不执行页面写入。`DecisionParser` 同时兼容 provider 常见 ask 变体，把 `type: "ask"` 或 `type: "ask_user"` 搭配 `message` 字段规范化为内部合法的 `ask_user.question`。

**偏差说明**：本次没有扩展意图识别词库，也没有让 Ask 模式自动升级执行权限。`task-classifier` 仍保留用于粗分 run mode 的历史规则，但不再产出 `actionIntent` / `requiresApproval`，权限申请改由模型结构化决策和 runtime 边界处理。

**权衡分析**：
- 方案一：继续扩充中文动作关键词。优点是改动小；缺点是违反去关键词化方向，且会不断漏场景。
- 方案二：修复模型决策解析，并用 `bh_request_act_mode` 作为 Ask 模式权限申请伪工具。优点是解决本次真实错误，不扩大 Ask 权限，也不靠关键词猜意图；缺点是需要 provider 做一次结构化判断。
- 选择方案二，因为 trace_31 的直接错误是模型输出 schema 兼容性，而 Ask->Act 应该是模型/工具契约驱动的权限申请，不是本地正则命中。

**验证结果**：
- `npm test -- tests/node/agent/parser/decision-parser.test.ts` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过。
- `npm test -- tests/node/agent/task/task-classifier.test.ts` 通过。
- `npm run typecheck` 通过。
- `npm run lint` 通过。

**待确认**：
- [ ] 是否继续把 `task-classifier` 的粗分 mode 规则也迁移为模型/结构化策略。

## Ask->Act 继续执行目标 Tab 继承 - 2026-05-28

**目标**：按浏览器扩展调试 SOP 验证 Ask->Act 卡片时，发现 `sidepanel.html?runId=...` 页面点击“切换到执行并继续”会丢失原目标 tab，导致 Act run 观察到 side panel 自己并报 `No frame returned content data`。

**设计决策**：`RunManager.getSnapshot()` 将内部 `RunRecord.tabId` 暴露为 `snapshot.targetTabId`；前端继续执行时优先使用当前 run snapshot 的 `targetTabId`，再回退 side panel prop 的 `targetTabId`。这样 runId 调试页即使收到 active-tab target 更新，也不会覆盖原 run 的目标页面。

**偏差说明**：没有改变普通 `tabId` side panel 的自动观察逻辑；只修复从历史/调试 run 页面继续 Ask->Act 时的目标 tab 继承。

**权衡分析**：
- 方案一：让 `sidepanel.html?runId=...` 永远 pinned，不监听 active target。优点是简单；缺点是入口层行为变化较大，可能影响其它调试页能力。
- 方案二：把目标 tab 作为 run snapshot 的一部分，继续动作按 run 继承。优点是语义准确，影响面小；缺点是 snapshot 多一个 UI 可用字段。
- 选择方案二，因为继续执行应绑定“这个 run 原本的页面”，不是当前激活的 extension tab。

**验证结果**：
- `npm test -- tests/dom/ui/sidepanel/cockpit-app-interaction.test.tsx` 通过。
- `npm test -- tests/node/runtime/run-manager.test.ts` 通过。
- `npm run typecheck` 通过。
- `npm run lint` 通过。
- 按扩展调试 SOP 使用 Chrome for Testing / unpacked extension / `BROWSER_HELM_DEBUG_CDP_PORT=9345` 验证：Ask 模式写入请求触发 `bh_request_act_mode` 和切换卡；点击“切换到执行并继续”后 Act run 继续，provider 请求数为 2，原 `basic-form.html` 文本输入值仍为空。

**待确认**：
- [ ] 无。

## v1.2 AgentLoop Prompt/Context Hardening 排期 - 2026-05-28

**目标**：判断 Tools Contract 写入 prompt、KV Cache 不变性、Context 压缩/预算/脱敏、Parse Error Repair 和 i18n locale bootstrap 是否已被 v1.1 后续版本承接；未被承接的内容补入 v1.2 roadmap。

**设计决策**：v1.1 后续 notes 已覆盖部分 prompt 历史预算、未知工具 repair、字段值脱敏和工具说明 i18n，但缺少版本级方案来约束 Tools Contract 的 KV-cache 稳定注入、统一 PromptContextPolicy、一次性 parse repair 以及 locale 单源 bootstrap。因此将 v1.2 从 Memory + Workflow Replay 扩展为 Memory/Replay + AgentLoop prompt/context hardening，并在 `docs/roadmap/v1.2-memory-workflow-replay.md` 中新增 T14-T17。

**偏差说明**：本次只更新 roadmap 和决策记录，没有修改 runtime 实现；Context 历史预算已有实现痕迹，但仍需要在 v1.2 中收敛为统一入口，而不是继续由多个局部补丁维护。

**权衡分析**：
- 方案一：继续放在 v1.1 hardening。优点是离当前表单链路近；缺点是 v1.1 已经完成且范围很大，继续追加会让版本边界失控。
- 方案二：作为独立 v1.1.x 补丁。优点是交付聚焦；缺点是 KV-cache、context summary、trace replay 和 memory summary 都与 v1.2 的 prompt/replay 基础设施强相关。
- 选择方案三：补入 v1.2，因为 v1.2 正好要做 StepSummary、RunSummary、SessionSummary、memory masking 和 trace replay seed，适合统一 Prompt ABI 与 ContextPolicy。

**待确认**：
- [ ] v1.2 是否需要先拆出一个 `implement-v1-2-agentloop-hardening` OpenSpec change，再与 memory/replay 并行推进？
- [ ] Tools Contract stable prefix 是否按 locale 分 cache，还是 tool contract description 固定英文、UI i18n 与模型 contract 分离？

## v1.1.2 P0/P1 前置与 P2 版本落点 - 2026-05-28

**目标**：回答完整 Mode System、完整 CDP debug 平台、全面 i18n、完整 eval 框架以及剩余 P2 内容是否已有版本规划；同时将 P0/P1 从后续版本中前置为立即修复项。

**设计决策**：新增 `docs/roadmap/v1.1.2-agentloop-security-hardening.md`，把 Tools Contract + KV-cache stable prompt ABI、PromptContextPolicy/预算/脱敏、Submit Approval stale revalidation、Prompt Injection hardening、Parse Error Repair、i18n locale bootstrap 和最小安全回归测试作为 v1.1.2 立即 hardening 范围。`docs/roadmap/v1.2-memory-workflow-replay.md` 改为复用 v1.1.2 的 Prompt ABI/ContextPolicy/Parse Repair/locale bootstrap，并只扩展 memory/workflow/replay 相关能力。

**偏差说明**：上一轮曾把这些 prompt/context hardening 项补进 v1.2；本次根据“P1 和 P0 现在就要修”的决策，将它们前置到 v1.1.2。v1.2 仍保留 memory summary、workflow preview 和 trace replay seed 对这些基础设施的扩展要求。

**权衡分析**：
- 方案一：全部留在 v1.2。优点是与 memory/replay summary 基础设施强相关；缺点是 P0/P1 安全问题会被延后。
- 方案二：在 v1.1 继续追加零散补丁。优点是离当前代码近；缺点是 v1.1 范围已经完成且过大，容易继续失控。
- 选择方案三：拆出 v1.1.2 立即 hardening。优点是能马上修主链路安全，同时给 v1.2 留出稳定基础；缺点是需要新增一个 roadmap 版本槽。

**P2 版本落点**：
- 完整 Mode System 重写：不进 v1.1.2；若最小 ToolSelector/权限边界不足，v1.2+ 后单独 proposal。
- 完整 CDP debug 平台：已有 roadmap 落点 v1.3 DevTools/CDP。
- 全面 i18n tool summary/error：v1.1.2 只修 locale bootstrap 和主界面关键文案；全量迁移后续 i18n hardening。
- 完整 eval 框架：v1.1.2 只建安全回归用例；完整 eval/replay 与 v1.2 trace replay seed 对齐。
- per-domain 权限模型：发布前必须做，建议排 v1.2 或 v1.2.x permission hardening。
- Goal/SuccessCriteria finish 判断：建议 v1.2+ 与 workflow/session summary 一起推进。

**待确认**：
- [ ] 是否立刻创建 `openspec/changes/implement-v1-1-2-agentloop-security-hardening` 并开始按 T1-T7 执行？

## 剩余 P2/长期项版本规划落地 - 2026-05-28

**目标**：将完整 Mode System、完整 CDP debug 平台、全面 i18n tool summary/error、完整 eval 框架、per-domain 权限模型和 Goal/SuccessCriteria 等剩余项全部落入后续版本规划文档，避免只停留在口头 backlog。

**设计决策**：新增 `docs/roadmap/v1.7-runtime-quality-i18n.md`，集中承接完整 Mode System / RuntimeStrategy 收敛、完整 ToolSelector、Goal/SuccessCriteria 产品化和全面用户可见 i18n hardening。更新 `docs/roadmap/v1.2-memory-workflow-replay.md`，把 per-domain permission/domain policy seed 与 Goal/SuccessCriteria summary bridge 放入 v1.2。更新 `docs/roadmap/v1.3-devtools-cdp.md`，明确完整 CDP debug 平台由 v1.3 承接。更新 `docs/roadmap/v2.0-platform.md`，明确完整 eval framework 由 v2.0 承接。同步 `docs/roadmap/readme.md` 和 `docs/roadmap/final-version-structure.md` 的版本总览。

**偏差说明**：没有把完整 Mode System 和全面 i18n 硬塞进 v1.1.2，因为 v1.1.2 只修 P0/P1 主链路安全；完整 runtime strategy 和 i18n 治理需要等 v1.2-v1.6 的工具面稳定后再统一收敛。

**权衡分析**：
- 方案一：全部放 v1.2。优点是近期可见；缺点是 v1.2 已经承担 memory/workflow/replay，范围过重。
- 方案二：全部放 v2.0。优点是平台期统一治理；缺点是 Mode System 和 i18n 会拖太久，影响 v1.x 产品质量。
- 选择方案三：按自然依赖拆分。v1.2 做 domain permission 和 completion bridge，v1.3 做 CDP，v1.7 做 RuntimeStrategy/i18n，v2.0 做完整 eval。

**待确认**：
- [ ] v1.7 是否需要后续补设计图，保持 roadmap 系列视觉完整。

## v1.1.2 Roadmap 结构化重写 - 2026-05-28

**目标**：将 `docs/roadmap/v1.1.2-agentloop-security-hardening.md` 从修复清单改写为与其他 roadmap 一致的 10 模块版本级需求说明，并补充足够详细的任务、技术方案、目录结构和验收标准。

**设计决策**：沿用 `docs/roadmap/readme.md` 规定的 10 模块结构：背景、用户故事、目标、不做什么、产品方案、设计图/视觉参考、技术方案、目录结构、依赖关系、验收标准。把 review 后校准出的 P0/P1 纳入 v1.1.2：`FORM_FILL_FIELD` 同等级安全校验、submit approval digest stale revalidation、合法 JSON prompt 裁剪、content script locale bootstrap、`.reasonix/` 清理和 README 准确性修正。

**偏差说明**：本次只更新 roadmap 文档，没有实现代码修复或运行测试。完整 Mode System、CDP、全量 i18n、完整 eval、memory/workflow replay 仍按此前版本落点放到 v1.7、v1.3、v1.7、v2.0 和 v1.2。

**权衡分析**：
- 方案一：保留短清单。优点是直观；缺点是不符合项目 roadmap 模板，也不足以指导 OpenSpec/实现。
- 方案二：一次性写成完整版本说明。优点是边界、任务、技术方案、测试和验收更清楚；缺点是文档更长。
- 选择方案二，因为 v1.1.2 是 P0/P1 hardening，需要比普通 TODO 更明确的验收边界。

**待确认**：
- [ ] 是否基于该 roadmap 创建 `openspec/changes/implement-v1-1-2-agentloop-security-hardening` 并开始实现？

## v1.1.3 发布治理与后续落点补齐 - 2026-05-29

**目标**：根据公开仓库审计报告，把版本治理、公开声明准确性、非表单高风险审批、MV3 生命周期、page-health hook、coverage/security/release CI 等新增问题全部补入 roadmap，并新增 v1.1.3。

**设计决策**：v1.1.2 继续承接主链路安全 hardening，并新增非表单 high-risk action 审批语义、runtime message sender boundary、Ask 观察性滚动语义和 README 隐私/工具表修正。新增 `docs/roadmap/v1.1.3-public-release-readiness.md`，专门承接 public release readiness：版本号/tag/release/checksum/CHANGELOG、coverage/security/release CI、工具文档一致性、manifest 权限审计和发布隐私声明。v1.2 增加 MV3 session persistence；v1.3 增加 page-health hook opt-in/CDP 替代；v2.0 增加 release/eval dashboard 平台化。

**偏差说明**：没有把 release workflow、coverage、安全扫描塞进 v1.1.2，因为 v1.1.2 是 runtime/security 修复；公开发布治理需要独立验收，故新增 v1.1.3。没有要求 v1.2 立即完整持久化所有 trace，但要求 pending approval/action、run generation 和 session audit 可恢复或安全失效。

**权衡分析**：
- 方案一：所有问题都放 v1.1.2。优点是集中；缺点是 runtime 修复和发布治理混在一起，范围过大。
- 方案二：发布治理放 v2.0。优点是平台化；缺点是公开仓库已经存在误导性声明和无 Release 问题，不能拖到平台期。
- 选择方案三：v1.1.2 修主链路安全，v1.1.3 修公开发布治理，v1.2/v1.3/v2.0 分别承接持久化、CDP/page-health 和平台化 eval/release dashboard。

**待确认**：
- [ ] v1.1.2 实现时，`bh_iframe_click` / `bh_iframe_type` 是直接隐藏/删除，还是补专用 approved execution flow？推荐先隐藏/删除公开暴露。
- [ ] v1.1.3 是否作为第一个正式 GitHub Release 版本号，还是先用 `v1.1.3-rc.1`？

## v1.1.2 DeepSeek 修复复查补丁 - 2026-05-29

**目标**：复查并补齐 DeepSeek 第三轮修复遗留问题，包括公开工具文档漂移、iframe mutating 工具残留、submit approval stale digest 上下文对比和 page-health hook 文档边界。

**设计决策**：选择直接删除公开 `bh_iframe_click` / `bh_iframe_type` ToolSpec，而不是继续隐藏或标记 deprecated。原因是当前没有非表单 high-risk action 的 approved resume flow，保留工具会让用户看到“批准但不执行”的危险能力错觉。

**偏差说明**：底层 Content RPC 的 iframe click/type 分支也同步删除，避免未来被误接回 ToolRegistry。历史测试中仍有一些旧 iframe mutating action 场景需要后续迁移为“工具不存在/不暴露”的断言。

**权衡分析**：
- 方案一：隐藏旧工具但保留实现。优点是测试改动少；缺点是继续留下误暴露风险。
- 方案二：删除公开工具和底层 RPC。优点是能力边界清晰；缺点是旧测试和历史文档需要迁移。
- 选择方案二，因为 v1.1.2 的安全目标优先于兼容旧 iframe mutating action 原型。

**待确认**：
- [ ] 是否要在下一步统一迁移旧 iframe action 测试为 removed-tool 回归测试？
- [ ] 是否要在 v1.3 前把 page-health hook 改成真正 Debug mode opt-in？

## v1.1.3 CI 与 landing 发布修复 - 2026-05-29

**目标**：修复 v1.1.3 发布前 CI、release artifact、coverage 依赖、iframe hidden mutation approval 回归和 landing 静态部署产物漂移问题，确保本地完整验证链路通过。

**设计决策**：保留 `bh_iframe_click` / `bh_iframe_type` 不进入公开 ToolRegistry，但恢复内部 iframe Content RPC 和 runtime approval 边界。landing 构建改为按 `package.json` 版本精确读取 `browser-helm-1.1.3-chrome.zip`，避免 stale zip 被误复制。release workflow 改为对 exact artifact 复制并写入 SHA256，coverage 输出加入 git/eslint ignore。

**偏差说明**：没有执行真实远端部署或创建 GitHub Release；本次验证范围是本地 CI 等价命令、Chrome for Testing E2E、release hygiene 和 `dist/landing` 静态服务访问。

**权衡分析**：
- 方案一：彻底删除 iframe mutating RPC。优点是边界更窄；缺点是现有 approval 回归测试和内部隐藏执行语义失效。
- 方案二：重新公开 iframe mutating ToolSpec。优点是实现路径简单；缺点是会把高风险能力重新暴露给 Agent 工具清单。
- 选择方案三：仅恢复内部 RPC 与 approval token 路径，不恢复公开工具清单，因为它同时满足回归测试和发布安全边界。

**待确认**：
- [ ] 是否需要继续把 `implementation-notes.md` 历史条目归档到 `implementation-notes-archive.md`，把主文件压回 300 行左右？
- [ ] 是否由维护者执行真实 GitHub Release / Pages 或 Vercel 远端部署验收？

## Ask 模式页面读取循环防护 - 2026-05-29

**目标**：根据 `browserhelm-trace-run_6-20260528 (1).jsonl` 复盘重构后 Ask 模式反复调用页面读取工具、不进入最终回答的问题，并补回类似 Claude Code 的循环提醒逻辑。

**设计决策**：在 runtime prompt 构建层检测最近连续 3 次以上页面内容读取工具成功、且没有页面变化的情况，向模型上下文注入 `loopGuard`。提醒模型不要继续调用相同读取工具，而是基于已有信息 `finish`、必要时 `ask_user`，或无法回答时 `fail`。

**偏差说明**：本次没有直接强制终止 run，因为问题表现是模型没有收到足够明确的循环反馈；先用 prompt guard 保持模型仍可在页面变化后继续读取。若后续模型仍无视 guard，可再加 runtime hard stop。

**权衡分析**：
- 方案一：达到阈值后直接失败。优点是省 token；缺点是用户会拿不到本来可以基于已有内容生成的答案。
- 方案二：只保留 recentActions。优点是改动少；缺点是 trace 已证明模型会忽略弱信号。
- 选择方案三：显式 `loopGuard` 提醒模型收敛，因为它最贴近“循环检测并提醒模型”的目标，同时保留回答机会。

**待确认**：
- [ ] 是否需要把同类 loop guard 扩展到 iframe read、a11y snapshot、observe 等其它只读工具循环？

## Ask 模式页面读取循环根因修复 - 2026-05-29

**目标**：根据 `browserhelm-trace-run_6-20260528 (2).jsonl` 修正上一轮只加 loopGuard 的不完整方案，先解决模型拿不到正文的问题，再保留循环提醒防护。

**设计决策**：`buildMessages()` 在最新工具结果为 `bh_page_read_article` / `bh_page_read_visible_text` 时，将 `detail.data.text`、`hasMore`、`nextCursor`、`totalTextLength` 等压缩为 `lastToolResult.pageRead` 注入模型上下文。同时降低旧 observation 和 structured refs 的预算，只保留摘要，确保最新读取正文优先于页面结构噪声。再通过 `decisionGuidance` 提醒模型：已有正文时优先完成回答；只有缺失尾部确实必要时才用 `nextCursor` 续读，不要只改 `maxChars` 或重复 cursor 0。

**偏差说明**：上一轮判断为“模型无视 recentActions”，但新 trace 证明更根本的问题是模型只看到 `Read article (truncated)` 的 summary，没有稳定拿到正文和分页状态。因此本轮把正文传递作为主修复，loopGuard 作为兜底防护。

**权衡分析**：
- 方案一：只加 loopGuard。优点是简单；缺点是模型仍然缺少正文，无法可靠总结。
- 方案二：把完整 structuredPageData、observation 和正文都塞进 prompt。优点是信息全；缺点是 x.com 这类页面会挤掉最新工具结果。
- 选择方案三：页面读取后优先保留最新正文，压缩旧页面结构，因为回答/总结任务最依赖工具刚读出的正文。

**待确认**：
- [ ] 是否要把 iframe read 也纳入同样的“最新读取内容优先”策略？
