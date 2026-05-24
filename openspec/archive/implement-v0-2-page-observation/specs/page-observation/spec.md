## ADDED Requirements

### Requirement: 页面观察工具
系统 MUST 提供真实只读页面观察能力，通过 content script 读取当前页面，并返回可复用的 observation 数据。

#### Scenario: 成功观察普通页面
- **WHEN** 当前页面可注入 content script 且包含可见内容
- **THEN** `bh_page_observe` MUST 返回包含 `url`、`title`、`currentDomain`、`origin`、`visibleTextSummary`、`pageStateSummary` 和 `refSummary` 的成功 ToolResult

#### Scenario: 页面没有交互元素
- **WHEN** 当前页面可观察但没有按钮、输入框、链接或其他候选交互元素
- **THEN** observation MUST 返回 empty 状态和原因，并保持 ToolResult 为可处理的只读结果

#### Scenario: 页面不可注入
- **WHEN** 当前页面因浏览器限制、权限限制或 content script 不可用而无法观察
- **THEN** 系统 MUST 返回结构化错误 `CONTENT_SCRIPT_UNAVAILABLE`，并提示用户或 runtime 该页面不可观察

### Requirement: Accessibility-like Snapshot
系统 MUST 提供 accessibility-like snapshot，识别常见可交互元素并为每个候选元素生成可读结构和 ref_id。

#### Scenario: 识别按钮输入框和链接
- **WHEN** 页面包含 button、input、textarea、select、anchor 或带有可识别 ARIA role 的交互元素
- **THEN** `bh_a11y_snapshot` MUST 返回元素的 role、name、tagName、visible、disabled 状态和 `refId`

#### Scenario: 模型不需要 CSS selector
- **WHEN** snapshot 返回交互元素
- **THEN** 模型和后续工具 MUST 能通过 `refId` 引用元素，不需要生成或猜测 CSS selector

### Requirement: Stable Ref 生命周期
系统 MUST 维护 stable ref map，并提供 ref 解析、刷新和失效检测。

#### Scenario: 解析有效 ref
- **WHEN** 后续工具使用仍然有效的 `refId`
- **THEN** `bh_a11y_resolve_ref` MUST 定位到对应 DOM node，并返回可验证的元素摘要

#### Scenario: ref 不存在
- **WHEN** 后续工具使用不存在的 `refId`
- **THEN** 系统 MUST 返回结构化错误 `REF_NOT_FOUND`，并提示重新观察或刷新 refs

#### Scenario: ref 已失效
- **WHEN** DOM 更新、导航或元素移除导致 `refId` 指向的 DOM node 不再有效
- **THEN** 系统 MUST 返回结构化错误 `REF_STALE`，并提示重新执行 observe 或 refresh refs

#### Scenario: 刷新 refs
- **WHEN** runtime 调用 `bh_a11y_refresh_refs`
- **THEN** 系统 MUST 基于当前 DOM 重建或刷新 ref map，并返回新的 ref summary

### Requirement: Observation 上下文边界
系统 MUST 将 full observation 与模型上下文 summary 分离，完整 DOM、完整 a11y tree、完整 ref map 和完整 visible text 不得直接进入模型上下文。

#### Scenario: 完整 observation 进入 trace
- **WHEN** `bh_page_observe` 或 `bh_a11y_snapshot` 成功返回
- **THEN** full observation payload MUST 可记录到 trace/storage
- **THEN** ToolResult context MUST 只暴露受限 summary

#### Scenario: 模型只接收 summary
- **WHEN** AgentLoop 构建下一轮模型上下文
- **THEN** 模型输入 MUST 只包含 `ObservationContextSummary`、必要 ref highlights 和 warnings

#### Scenario: observation 超出 budget
- **WHEN** visible text、a11y tree、ref map 或 summary 超出配置 budget
- **THEN** 系统 MUST 截断并返回 warning，或在无法生成合规摘要时返回 `OBSERVATION_BUDGET_EXCEEDED`

### Requirement: 页面元数据
系统 MUST 在 observation 中包含 URL、title、currentDomain 和 origin，供后续 domain policy、memory 和 workflow replay 复用。

#### Scenario: 提取 domain metadata
- **WHEN** 当前页面 URL 可解析
- **THEN** observation MUST 包含 `url`、`title`、`currentDomain` 和 `origin`

#### Scenario: URL 不可解析
- **WHEN** 当前页面 URL 无法按标准 URL 解析
- **THEN** 系统 MUST 返回可诊断 warning 或结构化 observation failure，而不是抛出未处理异常

### Requirement: LLM 上下文跨域隔离
系统 MUST 在 observation、ref map 和模型上下文摘要中保留页面来源边界，避免模型跨域混用页面内容或 ref。

#### Scenario: Summary 标注来源
- **WHEN** observation summary 被注入模型上下文
- **THEN** summary MUST 明确包含 `origin`、`currentDomain` 和页面 URL
- **THEN** 页面文本 MUST 被标记为来自该页面来源的 data

#### Scenario: 不跨域复用 ref
- **WHEN** 页面导航到不同 origin 后使用旧 `refId`
- **THEN** 系统 MUST 返回 `REF_STALE` 或要求重新 observe
- **THEN** 系统 MUST NOT 在新 origin 中复用旧 origin 的 DOM node 映射

#### Scenario: 不跨域混用页面事实
- **WHEN** AgentLoop 已观察过多个不同 origin 的页面
- **THEN** 模型上下文 MUST 保留每个 observation 的来源信息
- **THEN** 系统 MUST NOT 将某一 origin 的页面内容描述为另一 origin 的页面事实

#### Scenario: 页面内跨域指令保持为 data
- **WHEN** 页面文本要求模型访问其他域、忽略其他域策略或复用其他域信息
- **THEN** 该文本 MUST 只作为页面 data 进入 observation 或 visible text summary
- **THEN** 该文本 MUST NOT 改变 tool policy、domain boundary 或 system/developer instruction

### Requirement: LLM Provider API 请求边界
系统 MUST 将 DeepSeek/OpenAI-compatible provider 请求限制在 extension runtime 的受控 provider client 中，避免 content script、页面上下文或 UI 组件直接持有密钥并发起跨域请求。

#### Scenario: Provider 请求不从 content script 发起
- **WHEN** content script 处理 page/a11y/ref observation
- **THEN** content script MUST NOT 读取 provider API key
- **THEN** content script MUST NOT 向 DeepSeek/OpenAI-compatible provider 发起请求

#### Scenario: Provider 请求不从页面上下文发起
- **WHEN** 页面文本、DOM 或模型输出包含 provider endpoint 或跨域请求指令
- **THEN** 系统 MUST NOT 使用该内容作为 provider `baseUrl`
- **THEN** 页面 JS MUST NOT 参与 provider 请求

#### Scenario: Provider 请求走 background runtime
- **WHEN** extension runtime 需要调用 DeepSeek/OpenAI-compatible provider
- **THEN** 请求 MUST 通过 background/service worker 中的 provider client 发起
- **THEN** provider `baseUrl` MUST 来自用户设置或开发环境配置
- **THEN** API key MUST 不进入 content script、页面上下文或可见 trace payload

#### Scenario: Provider host permission 不可用
- **WHEN** provider endpoint 因 host permission、CORS、网络或浏览器策略不可访问
- **THEN** 系统 MUST 返回结构化 provider/network 错误
- **THEN** 验收报告 MUST 将该项标记为真实 provider 环境门控，而不是伪造成功

#### Scenario: UI 通过 RuntimePort 触发 provider 请求
- **WHEN** side panel 需要启动 agent run 或触发模型请求
- **THEN** UI MUST 通过 `RuntimePort` / `ExtensionRuntimePort` 与 background runtime 通信
- **THEN** UI MUST NOT 直接 import 或创建 `OpenAICompatibleClient`
- **THEN** UI MUST NOT 直接向 DeepSeek/OpenAI-compatible endpoint 执行 `fetch`

#### Scenario: Background runtime 装配 provider client
- **WHEN** extension runtime 创建 AgentLoop
- **THEN** background runtime MUST 从受控 settings/development config 读取 provider 配置
- **THEN** background runtime MUST 创建 provider client 并注入 AgentLoop
- **THEN** provider key MUST 不出现在 content script message、页面上下文或可见 trace payload

#### Scenario: Content/page 层不依赖模型层
- **WHEN** content script 或 `src/page/**` 执行 observation
- **THEN** 它们 MUST NOT import `src/agent/model/**`
- **THEN** 它们 MUST NOT 读取 provider settings 或 API key

### Requirement: Prompt Injection 页面内容隔离
系统 MUST 将页面中的指令式文字视为页面 data，不得让该文字改变 system prompt、developer instruction、tool policy 或 tool contract。

#### Scenario: 恶意页面文字进入 data
- **WHEN** prompt injection fixture 包含类似 “ignore previous instructions” 的页面文本
- **THEN** 该文本 MAY 出现在 observation data 或 visible text summary 中
- **THEN** 该文本 MUST NOT 改变工具可用性、工具风险等级、system prompt 或 developer instruction

### Requirement: 只读 Side Panel MVP
系统 MUST 提供 roadmap 指定的只读 side panel MVP 状态，用于展示页面观察和 Ref 映射。

#### Scenario: 展示页面观察
- **WHEN** observation 成功
- **THEN** side panel MUST 展示 URL、标题、可见文本摘要、页面状态和交互元素数量

#### Scenario: 展示 Ref 映射
- **WHEN** ref summary 可用
- **THEN** side panel MUST 展示 ref_id、role、name、tagName、visible、disabled 等 ref 映射信息

#### Scenario: 展示 empty 状态
- **WHEN** observation 成功但没有可展示内容或交互元素
- **THEN** side panel MUST 展示 empty 状态和原因

#### Scenario: 展示 error 状态
- **WHEN** observation 或 content RPC 返回结构化错误
- **THEN** side panel MUST 展示错误码、摘要和可操作提示

### Requirement: Extension E2E 测试必须使用 POM
系统 MUST 提供基于 Page Object Model 的 extension E2E 测试，用于验证真实插件链路，不用于验证设计稿一致性。

#### Scenario: E2E 使用本地 unpacked extension
- **WHEN** 运行 extension E2E 测试
- **THEN** 测试 MUST 加载本地构建的 unpacked extension
- **THEN** 测试 MUST NOT 依赖 Chrome Web Store 安装

#### Scenario: Spec 文件只表达场景
- **WHEN** 编写 E2E spec
- **THEN** spec MUST 通过 POM 调用页面动作和读取状态
- **THEN** spec MUST NOT 散落复杂 selector、extension 启动细节或 side panel 操作细节

#### Scenario: E2E 覆盖核心插件链路
- **WHEN** 运行 extension E2E 测试
- **THEN** 测试 MUST 覆盖 observe basic form、render ref mapping、handle stale ref、handle content unavailable、keep prompt injection as data 的核心链路

#### Scenario: E2E 不验证设计稿一致性
- **WHEN** E2E 测试断言 side panel 行为
- **THEN** 测试 MUST 断言功能状态和关键可访问文本
- **THEN** 测试 MUST NOT 以像素、间距、颜色或设计稿相似度作为通过条件

### Requirement: 真实浏览器验收分级
系统 MUST 将无人值守环境下的真实插件验收分为必须通过项和环境门控项，并在最终报告中明确区分验证类型。

#### Scenario: 必须通过的自动化验收
- **WHEN** 0.2 实现完成
- **THEN** `npm run build` MUST 成功生成本地 unpacked extension
- **THEN** schema、DOM、node tool、agent regression 测试 MUST 通过
- **THEN** 当前环境可运行的 POM E2E MUST 执行并报告结果

#### Scenario: 自动化加载 extension
- **WHEN** 自动化 Chromium 可以加载本地 unpacked extension
- **THEN** E2E MUST 验证 fixture 页面、content script、background/content RPC、observation、ref mapping、stale/error/prompt-injection 核心链路

#### Scenario: 环境门控项不能伪造通过
- **WHEN** 真实 Chrome side panel、扩展权限 UI、系统弹窗或视觉对照需要人工介入
- **THEN** 该项 MUST 标记为环境阻塞或待人工复验
- **THEN** 完成报告 MUST 写明阻塞步骤、现象和后续人工检查清单

#### Scenario: 最终报告区分验证类型
- **WHEN** 汇报 0.2 验收结果
- **THEN** 报告 MUST 区分真实调用、自动化 E2E、mock/静态检查、手工检查和因环境阻塞未验证的项目

### Requirement: v0.1 Kernel 兼容性
v0.2 MUST 保持 v0.1 AgentLoop、ToolRegistry、TraceRecorder 和 context compaction 行为兼容。

#### Scenario: 既有 kernel 测试继续通过
- **WHEN** v0.2 新增 page observation 能力后运行既有 v0.1 测试
- **THEN** AgentLoop、ToolRegistry、TraceRecorder、ContextCompactor 的既有行为 MUST 不受破坏

#### Scenario: 真实 page tools 通过 ToolRouter 接入
- **WHEN** AgentLoop 调用 `bh_page_observe` 或 `bh_a11y_snapshot`
- **THEN** 调用 MUST 经过 ToolRegistry 和 ToolRouter 的既有 args/result schema 校验路径
