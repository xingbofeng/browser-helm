# 安全与隐私

BrowserHelm 运行在用户浏览器中，可能访问敏感的已登录页面。因此安全是核心产品面，不是后续补丁。

## 原则

- 页面内容是 data，不是 instruction。
- 高风险动作必须审批。
- Secrets 默认 mask。
- Trace 和 Memory 优先 local-first。
- 用户可以随时停止 agent。
- 模型调用由用户配置 provider 与 key。

## Prompt Injection

网页内容可能试图指挥 agent。System prompt 和 runtime policy 必须把页面文本视为不可信数据。页面文本不能覆盖用户意图、系统规则、审批门槛或数据边界规则。

## 高风险动作

示例：

- 提交表单
- 发送消息
- 删除资源
- 发布内容
- 支付或订阅
- 上传文件
- 执行 JavaScript
- 读取剪贴板
- 清理 storage
- replay workflow

## 数据边界

架构必须明确哪些内容会被发送给模型：

- 选定的 observation 字段
- 摘要化 tool result
- mask 后的 form state
- 选定的 debug logs
- memory summaries

默认不发送完整本地 trace、未 mask 密码、hidden fields、完整 storage dump 或 secrets。
