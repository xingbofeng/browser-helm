## ADDED Requirements

### Requirement: 工具头部 TSDoc/JSDoc 金标准

系统 MUST 要求每个 `src/tools/**/bh-*.ts` 工具模块在导出的 ToolSpec 或 ToolSpec factory 前提供 TSDoc/JSDoc 风格块注释。

#### Scenario: 新工具包含头部块注释
- **WHEN** 新增 `bh_` 工具模块
- **THEN** 工具导出的 ToolSpec 或 ToolSpec factory 前 MUST 存在 `/** ... */` 块注释
- **THEN** 注释 MUST 服务维护者阅读，不替代 ToolSpec description

#### Scenario: 历史工具补齐头部块注释
- **WHEN** v0.33 工具规范治理完成
- **THEN** 所有现有 `src/tools/**/bh-*.ts` 工具 MUST 具备同等 TSDoc/JSDoc 风格块注释
- **THEN** 系统 MUST NOT 只依赖 `ToolSpec.title` 前的短行内注释表达工具语义

### Requirement: 工具头部注释内容

工具头部 TSDoc/JSDoc 注释 MUST 覆盖工具维护所需的关键语义。

#### Scenario: 注释说明工具用途
- **WHEN** 维护者阅读工具头部注释
- **THEN** 注释 MUST 说明工具在 Agent 语义中的用途和典型使用时机
- **THEN** 注释 MUST 说明适用 run mode

#### Scenario: 注释说明风险边界
- **WHEN** 工具可能读取或修改页面状态
- **THEN** 注释 MUST 说明工具是否只读、是否会改变页面状态、风险等级和是否可能触发 approval

#### Scenario: 注释说明参数和返回
- **WHEN** 工具定义 argsSchema 或 resultSchema
- **THEN** 注释 MUST 概述主要参数含义
- **THEN** 注释 MUST 概述返回结果语义、关键 code 和 next hints

### Requirement: ToolSpec title 短注释保留

系统 MUST 保留 `ToolSpec.title` 字段前的简短中文维护注释。

#### Scenario: title 前短注释存在
- **WHEN** 维护者查看 ToolSpec title
- **THEN** title 字段前 MUST 有一句简短中文注释说明该工具的用途和使用时机
- **THEN** 该短注释 MUST 与头部 TSDoc/JSDoc 不冲突

### Requirement: 工具 README 清单一致

系统 MUST 保持 `src/tools/README.md` 与实际 `bh_` 工具文件一致。

#### Scenario: 新增或迁移工具后更新清单
- **WHEN** 新增、删除、重命名或迁移 `bh_` 工具
- **THEN** `src/tools/README.md` MUST 同步更新已实现工具表格
- **THEN** 表格 MUST 包含工具名、title、目录、mode、risk、参数和含义

#### Scenario: v0.33 清单检查
- **WHEN** v0.33 补齐工具注释和 frame 工具迁移
- **THEN** `src/tools/README.md` MUST 覆盖所有现有 `src/tools/**/bh-*.ts`
- **THEN** README MUST 不包含已删除路径或遗漏的新工具
