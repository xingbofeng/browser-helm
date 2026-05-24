# implementation-notes

## 全局规则（保留为优先约束）

2026-05-24 以后每次开始会话时优先读取 `CONTEXT.md`、`handoff.md`（若存在）、`implementation-notes.md`。  
文档语言统一中文；代码与实现风格按仓库现有约定执行。  
遇到高风险/边界问题，优先补齐验证路径，不先追求最短路线。  
涉及真实浏览器、side panel、content/runtime RPC 的改动，必须做：`npm run build`、`npm run typecheck`、`npm run lint`，并尽量补 `npm run test:e2e`。  
工具新增/迁移必须保留 `ToolSpec.title` 中文维护说明、完整 schema 与风险边界，并同步 `src/tools/README.md`。  
新增依赖要解释必要性，避免先验假设；实现与验收按最小闭环推进。  
偏离既定决策必须在“偏差说明”里记录原因与影响。  
超过一次对话的历史决策、执行细节与临时验证内容，归档到 `implementation-notes-archive.md`。

> 备注：当前会话要求“全局规则先行”，主文件只保留高频共识；历史细节不再展开在主文件中。

## [2026-05-24 任务摘要]

### v0.1：Agent Kernel
- 完成 OpenSpec 约束下的 kernel/runtime 与 trace 契约收口；保留上下文压缩策略与工具调用可解释日志。  
- 风险点：`ToolResult.data` 不直接拼给模型；通过 context summary 与 context compaction 做隔离。

### v0.1 Review 收口
- 补齐工具协议未完整入模问题：ToolRouter 提供 contract，AgentLoop 只编排执行。  
- 引入高风险工具审批阻断，确保 high-risk 不可绕过运行时审批策略。

### v0.2：页面观察与 Ref 原型
- 建立真实页面观察链路与 side panel 只读承载，content/runtime 边界固定在 background。  
- 完成真实 extension 调试与 E2E 验证，补齐 empty/prompt-injection/ref stale/error 等场景。

### v0.2 运行与测试工程化收口
- 引入 `debug:extension` / `debug:extension:watch`，采用 Chrome for Testing（避免系统 Chrome 不再稳定自动加载 unpacked）。  
- 统一三层 POM（specs/flows/pages、components）与 E2E 稳定层。  
- 侧边栏在无 `tabId` 时改按 active tab + tab 切换/导航监听刷新观察快照。

### 文件与命名治理
- 推进 kebab-case 与 `src/tools/README.md` 清单同步。  
- 全仓库命名归一化后，补齐引用并保证构建与 lint/typecheck 通过。

### 调试与开发体验
- `agent:dev`、`test:e2e` 与 E2E debug 走可复现、可自动化路径。  
- side panel 的文案/可见性与旧快照残留问题修正后，watch 重启机制改为会话重启，避免 `chrome-extension://` 访问抖动。

### v0.3：Structured Page Data
- 引入结构化页面数据总契约（observation/ref/interactive/forms）与状态模型。  
- 统一 empty / unsupported / error 状态语义，UI 和 trace 使用可确定性摘要。  
- 复杂内容仍保持只读范围，动作用例保留到后续版本。

### v0.31 / v0.32 决策框架
- 明确只做只读识别与诊断：interactive 与 form 先识别，不承诺 action readiness。  
- 引入最小 Run Mode Gate（Ask/Debug/Form 三模式）先行裁剪工具可见性。  
- 归并 roadmap 与架构说明，区分 interactive/form 与后续 action readiness 的边界。

### v0.3 数据流与文档化
- 完成 v0.3 架构图 + 数据流图替换（图片化资产），提高文档可读性。  
- OpenSpec 流程按变更完整状态推进并验证。

### v0.33 / v0.4 roadmap 配图补齐
- 参考 v0.31 / v0.32 的现有系列样式，为 v0.33 Safe Action Readiness 与 v0.4 Cockpit UI 补齐内嵌架构图。  
- 路线图文档改为直接引用 `docs/roadmap/assets/` 下的本地图片资产，保持后续维护路径一致。  
- v0.33 从“设计图不适用”调整为“技术架构图适用”，用于表达 approval contract 与 runtime 状态边界。

## 重要待确认（跨版本）

- [ ] 是否将终止工具 (`bh_agent_finish` / `bh_agent_fail` / `bh_agent_ask_user`) 迁移为自然 terminal decision 的独立语义？  
- [ ] 是否将“外部 URL 的人工验证清单”写入固定的 debug checklist。  
- [ ] 是否将 `BROWSER_HELM_AGENT_URL` 从默认值改成必须显式传参。  
- [ ] v0.31/v0.32 interactive 与 forms 上线后，是否继续保留 current placeholder 文案，还是直接切到最小可交互展示。
- [ ] v0.33 若先实现 `bh_iframe_read` / `bh_iframe_click` / `bh_iframe_type`，后续进入 submit 类动作时提醒用户单独确认 `iframe_submit` / `bh_form_submit_with_approval` 的 approval UI、字段摘要和 submit 前 verify 边界。
- [ ] v0.33 需要一次性补齐所有现有 `src/tools/` 工具的 TSDoc/JSDoc 风格块注释；新增 iframe/action readiness 工具也必须按同一标准落地。该要求已记录到 `AGENTS.md` 的工具实现规范。

## [v0.33 漏提交与 v0.4 Cockpit 骨架补齐] - 2026-05-25

**目标**：修复前次提交漏掉的 OpenSpec v0.4 提案/UI 骨架与新增测试，并把工具名、runtime message、content RPC message、trace/error code 等字符串收敛到常量。

**设计决策**：选择保留现有产品 side panel 入口，Cockpit UI 先作为独立 `src/ui/sidepanel/cockpit-app.tsx` 骨架和测试对象存在。原因：v0.4 仍处于提案/骨架阶段，不能破坏 v0.33 已通过的 extension E2E 产品验收。

**偏差说明**：本次不归档 v0.4 change，只提交提案与最小可测骨架。原因：v0.4 尚未进入完整实现验收；当前目标是修复漏提交和常量化问题。

**权衡分析**：
- 方案一：把 CockpitApp 直接替换成产品 side panel。优点是能更快看到新 UI；缺点是会破坏旧 E2E 与既有产品行为。
- 方案二：旧入口继续服务产品验收，CockpitApp 先通过 runtime port/fake port 做组件级闭环。优点是风险小、测试稳定；缺点是 UI 正式切换要留到 v0.4 后续实现。
- 选择方案二，因为它符合当前版本边界，也避免把提案阶段 UI 混入产品路径。

**验证记录**：
- `npx openspec validate implement-v0-4-cockpit-ui --strict`：passed。
- `npm run typecheck`：passed。
- `npm run lint`：passed。
- `npm test`：92 files / 318 tests passed。
- `npm run build`：passed。
- `npm run test:e2e`：10 passed。

**待确认**：
- [ ] v0.4 正式实现时，再确认 CockpitApp 何时替换 legacy side panel 产品入口。
