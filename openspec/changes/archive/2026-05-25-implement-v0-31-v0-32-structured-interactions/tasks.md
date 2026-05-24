## 1. Run Mode Gate

- [x] 1.1 为 `RunMode`、`AgentRunInput.mode` 默认值和未知 mode 拒绝行为编写失败测试。
- [x] 1.2 实现 `ask`、`debug`、`form` 三种 run mode schema/type，默认 mode 为 `ask`。
- [x] 1.3 为 ToolRouter prompt contract 裁剪编写测试，覆盖 `ask`、`debug`、`form` 和 `internal` 工具可见性。
- [x] 1.4 实现按 run mode 裁剪 `listToolContracts` / prompt tool surface。
- [x] 1.5 为工具执行门禁编写测试，覆盖当前 mode 不允许工具时返回结构化错误且不执行工具。
- [x] 1.6 实现 ToolRouter 执行前 mode 校验，并让 `internal` 工具在 `ask`、`debug`、`form` 下可用。
- [x] 1.7 更新 AgentLoop / ContextBuilder / system prompt，将当前 run mode 传入工具裁剪链路。
- [x] 1.8 更新 trace/run metadata，记录当前 run mode。
- [x] 1.9 在 side panel 任务输入区新增 Ask / Debug / Form mode 选择，默认 Ask。
- [x] 1.10 在 side panel run snapshot 或 trace header 展示当前 run mode。

## 2. Schema 和测试基线

- [x] 2.1 为 `InteractiveElement`、interactive tab item 和只读 element tool payload 编写失败的 schema 测试。
- [x] 2.2 为 `FormFieldSnapshot`、disabled submit reason、form submit summary、forms tab item 和只读 form tool payload 编写失败的 schema 测试。
- [x] 2.3 实现共享 schema 和类型导出，并保持既有 `StructuredPageData` 外壳兼容。
- [x] 2.4 补充 interactive/form fixtures，覆盖常见原生控件、ARIA 控件、tabindex 边界、无交互元素、基础表单、无 form 标签字段、无表单、无效字段、disabled submit、submit 未找到和敏感字段。

## 3. v0.31 Interactive Elements

- [x] 3.1 为 `interactive-filter` 编写 DOM 单测，覆盖原生按钮、链接、输入控件、select、textarea、summary 和常见 ARIA 交互 role。
- [x] 3.2 为 tabindex 边界编写 DOM 单测，证明只有 role/name 或明显交互信号的 tabindex 元素会被纳入。
- [x] 3.3 实现 `src/page/a11y/interactive-filter.ts`，基于 ref map、DOM 属性和 a11y 语义识别交互元素。
- [x] 3.4 为 `element-state-reader` 编写 DOM 单测，覆盖 visible、disabled、checked、selected 和状态不可读 warnings。
- [x] 3.5 实现 `src/page/a11y/element-state-reader.ts`，只读读取交互元素状态。
- [x] 3.6 为 `interactive-ranker` 编写单测，覆盖确定性排序、visible/enabled 优先级和 DOM 顺序兜底。
- [x] 3.7 实现 `src/page/a11y/interactive-ranker.ts`，输出稳定排序的 interactive element list。
- [x] 3.8 将 v0.31 interactive element list 接入 `StructuredPageData.interactive`，替换 v0.3 的浅层 ref 派生。

## 4. v0.31 只读工具

- [x] 4.1 为 `bh_a11y_find_interactive` 编写 Node 工具测试，覆盖 ready、empty、partial、warning 和 `debug/form` modes。
- [x] 4.2 实现并注册 `src/tools/a11y/bh-a11y-find-interactive.ts`，同步补 title 注释和 `src/tools/README.md` 表格。
- [x] 4.3 为 `bh_element_inspect` 和 `bh_element_read_state` 编写 Node 工具测试，覆盖有效 ref、`REF_STALE` 和 `debug/form` modes。
- [x] 4.4 实现并注册 `src/tools/element/bh-element-inspect.ts` 和 `src/tools/element/bh-element-read-state.ts`，同步补 title 注释和 README。

## 5. v0.32 Form Fields

- [x] 5.1 为 `label-resolver` 编写 DOM 单测，覆盖 label[for]、父级 label、aria-labelledby、aria-label、placeholder、name、id fallback 和解析失败 warning。
- [x] 5.2 实现 `src/page/dom/label-resolver.ts`，固定 label 解析优先级并输出 warnings。
- [x] 5.3 为 `sensitive-field` 编写 DOM 单测，覆盖 password、token、secret、api key、otp 和普通字段。
- [x] 5.4 实现 `src/page/dom/sensitive-field.ts`，在 value preview 生成前执行 mask。
- [x] 5.5 为 value preview 编写 DOM 单测，覆盖普通文本 32 字符、textarea 80 字符、checkbox/radio/select 状态预览。
- [x] 5.6 为 `validation-reader` 编写 DOM 单测，覆盖 required、disabled、validationMessage、validity 失败和 aria-invalid。
- [x] 5.7 实现 `src/page/dom/validation-reader.ts`，读取字段状态和校验状态。
- [x] 5.8 为 `submit-detector` 编写 DOM 单测，覆盖原生 submit、form 属性关联、disabled submit、`confirmed`、`inferred` 和 `unknown` 原因。
- [x] 5.9 实现 `src/page/dom/submit-detector.ts`，只读诊断 submit button 状态和 disabled reason。
- [x] 5.10 为 `form-reader` 编写 DOM 单测，覆盖有表单、无 form 标签字段、无表单、submit 未找到 partial、字段级 warnings 和 partial snapshot。
- [x] 5.11 实现 `src/page/dom/form-reader.ts`，基于 interactive elements、ref map 和 DOM form 结构生成 form field snapshot。
- [x] 5.12 将 v0.32 form field snapshot 接入 `StructuredPageData.forms`，把可用页面从 `unsupported` 升级为 ready/empty/partial/error。

## 6. v0.32 只读工具

- [x] 6.1 为 `bh_form_list`、`bh_form_inspect` 和 `bh_form_read_fields` 编写 Node 工具测试，覆盖 `form/debug` modes。
- [x] 6.2 实现并注册 `src/tools/form/bh-form-list.ts`、`src/tools/form/bh-form-inspect.ts` 和 `src/tools/form/bh-form-read-fields.ts`，同步补 title 注释和 README。
- [x] 6.3 为 `bh_form_find_missing_required` 和 `bh_form_find_validation_errors` 编写 Node 工具测试，覆盖 `form` mode。
- [x] 6.4 实现并注册 `src/tools/form/bh-form-find-missing-required.ts` 和 `src/tools/form/bh-form-find-validation-errors.ts`，同步补 title 注释和 README。
- [x] 6.5 为 `bh_form_find_disabled_submit_reason` 编写 Node 工具测试，覆盖 `confirmed`、`inferred`、`unknown` 和 `form` mode。
- [x] 6.6 实现并注册 `src/tools/form/bh-form-find-disabled-submit-reason.ts`，同步补 title 注释和 README。

## 7. UI、上下文和验证

- [x] 7.1 更新 side panel 交互元素 tab，展示真实 count、empty/error 状态、元素列表和基础选中详情。
- [x] 7.2 更新 side panel 表单字段 tab，展示字段 count、required、validation error、submit disabled summary、字段列表和 disabled reason 中文置信标签。
- [x] 7.3 更新 deterministic structured page summary，使 Agent context 只包含裁剪后的 interactive/forms 关键状态，不默认列出完整 value preview。
- [x] 7.4 补充或更新集成测试，证明 v0.2 observation/ref 和 v0.3 structured outer contract 不受影响。
- [x] 7.5 补充或更新测试，证明 v0.31 interactive elements 在 v0.32 接入后不受影响。
- [x] 7.6 对照 v0.31/v0.32 roadmap 验收标准逐项检查，并记录任何目录范围偏离。
- [x] 7.7 通过截图或浏览器验证记录 v0.31/v0.32 最小 UI 与设计图 / 视觉参考的一致性。
- [x] 7.8 运行 `npm run typecheck`、`npm run lint` 和相关 Vitest。
- [x] 7.9 如涉及 extension/content RPC 或 side panel 行为，运行 `npm run test:e2e`。
- [x] 7.10 在 `implementation-notes.md` 追加本次实现决策、偏差说明、权衡分析和待确认事项。
