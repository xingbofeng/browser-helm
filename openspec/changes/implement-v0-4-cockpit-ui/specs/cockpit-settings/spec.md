## ADDED Requirements

### Requirement: Provider Settings UI
Cockpit UI MUST 提供 Settings UI 用于配置 provider `apiKey`、`baseUrl` 和 `model`。

#### Scenario: 用户保存 provider settings
- **WHEN** 用户在 Settings 中输入 apiKey、baseUrl 和 model 并保存
- **THEN** 系统 MUST 通过 runtime/storage 边界保存 provider settings
- **THEN** UI MUST NOT 直接散写未受控的 chrome.storage key

#### Scenario: Provider settings 读取
- **WHEN** 用户重新打开 Cockpit UI
- **THEN** Settings UI MUST 能读取已保存的 baseUrl 和 model
- **THEN** apiKey MUST 只以 masked preview 或空安全状态展示

### Requirement: API Key 遮蔽
Settings UI MUST 避免 API key 明文出现在非输入编辑场景。

#### Scenario: API key 输入控件
- **WHEN** 用户编辑 API key
- **THEN** 输入控件 MUST 使用 password/masked 类型或等价遮蔽行为

#### Scenario: API key 不进入 trace
- **WHEN** 保存 provider settings 或发起 run
- **THEN** trace、timeline、ToolInspector 和 run metadata MUST NOT 展示 API key 明文

### Requirement: 用户行为策略预留
Settings UI MUST 预留用户行为策略入口，但 v0.4 不要求全部策略真实生效。

#### Scenario: 策略开关可见
- **WHEN** 用户打开 Settings
- **THEN** UI MUST 展示默认只读、提交前确认、domain 禁用、debug/network 读取开关或等价预留项

#### Scenario: 策略预留不虚假承诺
- **WHEN** 某个策略开关在 v0.4 尚未接入 runtime enforcement
- **THEN** UI MUST 明确其为预留或待接入状态
- **THEN** 系统 MUST NOT 声称该策略已经全局生效

