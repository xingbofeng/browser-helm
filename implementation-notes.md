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
