## ADDED Requirements

### Requirement: v0.4 E2E 与真实浏览器验收边界
v0.4 UI 验收 MUST 优先通过自动化测试覆盖，真实 Chrome for Testing SOP 只补充 E2E 难以稳定覆盖的 side panel 宿主行为。

#### Scenario: E2E 遵循 POM
- **WHEN** 为 v0.4 新增 extension E2E
- **THEN** spec 层 MUST 只描述场景和验收意图
- **THEN** flow 层 MUST 编排 fixture、extension shell、side panel 和断言流程
- **THEN** page/component object MUST 封装 locator、页面动作和组件级断言

#### Scenario: 不在 spec 直接写复杂 locator
- **WHEN** 编写 v0.4 E2E spec
- **THEN** spec MUST NOT 直接拼装多个 Page Object
- **THEN** spec MUST NOT 直接写复杂 locator 或绕过 flow 层

#### Scenario: SOP 补充验收范围
- **WHEN** v0.4 UI 行为无法由 E2E 稳定覆盖
- **THEN** 真实浏览器验收 MUST 使用 Chrome for Testing / debug extension SOP
- **THEN** 验收 SHOULD 限定在原生 side panel 尺寸、滚动、resize、approval drawer 可用性和 settings masking 等宿主场景

