# Memory

BrowserHelm memory 是 local-first，并且必须允许用户查看和控制。

## Memory 类型

- Scratchpad：当前任务工作记忆。
- Domain memory：某个网站/domain 的经验、偏好和注意事项。
- Workflow memory：可复用工具序列、locator 和成功元数据。
- User preference memory：可选，必须由用户控制。

## Replay 策略

Workflow replay 不能静默执行。Runtime 必须先展示 replay plan，并在用户确认后执行。即使用户批准 replay，其中的高风险步骤仍然需要经过 policy 检查。

## 存储

Memory 通过 Dexie.js 存储在 IndexedDB。Settings 和轻量偏好可使用 `chrome.storage`。

## 隐私

Memory 默认不存 secrets。密码、API keys、tokens、OTP 和敏感字段值默认 mask，除非用户明确选择更窄范围的 local-only 行为。
