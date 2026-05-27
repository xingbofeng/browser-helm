## ADDED Requirements

### Requirement: 模型配置弹窗
v1.0.1 side panel MUST provide a model configuration modal opened from the top-right MoreHorizontal entry.

#### Scenario: 打开模型配置
- **WHEN** 用户点击 side panel 右上角三个点或等价设置入口
- **THEN** UI MUST 打开模型配置弹窗
- **THEN** 弹窗 MUST 支持 API Key、Base URL、Model 和 Streaming 开关

#### Scenario: 保存本地配置
- **WHEN** 用户保存模型配置
- **THEN** 系统 MUST 通过既有 runtime/storage 边界保存 provider settings
- **THEN** 配置 MUST 只保存在本地浏览器扩展存储

### Requirement: Streaming 开关
模型配置 MUST expose a streaming enablement switch.

#### Scenario: 默认开启
- **WHEN** 用户没有保存过 `streamingEnabled` 设置
- **THEN** 系统 SHOULD 将 streaming 视为开启
- **THEN** 用户 MAY 在模型配置弹窗中关闭 streaming

#### Scenario: 关闭 streaming
- **WHEN** 用户关闭 streaming 并保存
- **THEN** 后续模型输出 MUST 使用非流式 `complete()` 或等价路径
- **THEN** Debug MUST 能显示实际未使用 streaming

### Requirement: Provider 测试连接
模型配置 MUST provide a user-triggered test connection action.

#### Scenario: 用户测试连接
- **WHEN** 用户点击“测试连接”
- **THEN** runtime MUST 发起最小 provider 测试请求或等价检查
- **THEN** UI MUST 显示连接成功、失败和是否支持 streaming
- **THEN** 测试连接 MUST NOT 启动 Agent run

#### Scenario: 保存不自动测试
- **WHEN** 用户点击保存配置
- **THEN** 系统 MUST 保存配置
- **THEN** 系统 SHOULD NOT 自动发起 provider 测试请求

## MODIFIED Requirements

### Requirement: Provider Settings UI
v1.0.1 Provider Settings UI MUST move from the old settings panel into the model configuration modal.

#### Scenario: Settings 入口迁移
- **WHEN** 用户需要配置 apiKey、baseUrl 或 model
- **THEN** 用户 MUST 能从右上角模型配置弹窗完成配置
- **THEN** 默认 Debug Tabs MUST NOT 再提供重复 Settings Tab

### Requirement: API Key 遮蔽
API key masking MUST apply to the model configuration modal, provider test, streaming events and AgentMessage.

#### Scenario: API key 不进入 v1.0.1 可见状态
- **WHEN** 用户保存、测试或使用 provider settings
- **THEN** trace、Debug、AgentMessage、streaming state、test result 和截图文案 MUST NOT 展示完整 API Key
