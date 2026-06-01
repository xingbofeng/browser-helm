# Shared

真实场景共用代码放这里，包括：

- scenario 类型和优先级元数据；
- 真实模型 runner；
- trace 工具调用断言；
- 第三方站点稳定等待 helper；
- 真实站点特殊断言 helper。

当前共用 runner 仍在 `tests/e2e/flows/real-model-scenario-runner.ts`；后续迁移真实场景时再移动到本目录，避免一次性改动过大。
