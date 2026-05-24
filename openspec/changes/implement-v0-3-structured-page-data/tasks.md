## 1. Schema 契约

- [ ] 1.1 为 `TabDataStatus`、统一 tab data 外壳、structured warning/error、`StructuredPageData` 增加 Node schema 测试。
- [ ] 1.2 在 `src/shared/schemas/` 下实现 structured page data 共享 schema。
- [ ] 1.3 补充 `empty` 与 `unsupported` 区分测试，并覆盖 `updatedAt`、`summary`、`count`、`items`、`warnings` 必填字段。

## 2. Structured Page Data Builder

- [ ] 2.1 增加 DOM/page structured 测试，验证可从成功的 v0.2 observation fixture 构建 structured page data。
- [ ] 2.2 实现 `src/page/structured/structured-page-data.ts`，从 observation/ref summary 输入创建 observation、refs、interactive、forms 四类 tab data。
- [ ] 2.3 从 v0.2 ref summaries 浅层派生 interactive data，不新增 v0.31 的完整状态要求。
- [ ] 2.4 在完整 form reading 不可用时，实现 forms tab 的 `unsupported` 行为。
- [ ] 2.5 实现 tab warning/error helper 和 empty state reason 常量。

## 3. 确定性 Summary

- [ ] 3.1 增加测试覆盖 deterministic tab summary 和 structured context summary 输出。
- [ ] 3.2 实现不调用模型/provider 的确定性 summary 生成。
- [ ] 3.3 确保完整 structured page data 与模型可见 context summary 可以清晰分离。

## 4. Runtime 集成

- [ ] 4.1 增加 runtime snapshot 测试，证明成功 observation 后会生成 structured page data。
- [ ] 4.2 更新 runtime snapshot 类型以包含 structured page data，同时保持既有 observation/ref snapshot 兼容。
- [ ] 4.3 将 structured page data builder 接入 observation runtime flow，不新增模型可见的 `bh_page_structured_data` 工具。
- [ ] 4.4 保持既有 v0.1/v0.2 测试通过，不改变 `bh_page_observe` payload 语义。

## 5. UI Readiness

- [ ] 5.1 如果现有 side panel 消费更新后的 runtime snapshot，增加针对 structured tab states 的聚焦渲染测试。
- [ ] 5.2 保持 UI 改动最小；v0.3 不实现完整 Cockpit 搜索、筛选、详情 UI。

## 6. 验证与文档

- [ ] 6.1 运行 `npm run typecheck`。
- [ ] 6.2 运行 `npm run lint`。
- [ ] 6.3 运行 structured page data 相关 Node 和 DOM 测试。
- [ ] 6.4 根据触及的 runtime/UI 范围运行更广的回归测试。
- [ ] 6.5 更新 `implementation-notes.md`，记录 v0.3 设计决策、偏差、权衡和验证记录。
