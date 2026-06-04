# Selection Context Actions Design

## Goal

为 BrowserHelm 增加选中文字后的右键快捷入口：一键解释和一键翻译。

## Product Behavior

用户在普通网页中选中文字并打开右键菜单时，BrowserHelm 提供两个菜单项：

- 用 BrowserHelm 解释
- 用 BrowserHelm 翻译成中文

点击菜单后，扩展在当前 tab 上启动一个 `ask` run，并打开 Cockpit UI 展示结果。功能只读，不修改页面，不绕过现有 provider、domain consent、trace、message 和 side panel 订阅路径。

## Architecture

菜单注册与点击处理放在 background 层，因为 Chrome context menu 是扩展宿主能力，且 background 已持有 `RunManager` 与 side panel 打开能力。选中文本会被转换成普通用户任务后进入现有 `startRun` 路径；side panel 通过 `runId` 参数打开并订阅该 run。

新增一个小模块负责：

- 定义右键菜单 ID 与标题。
- 将选中文本转换为解释或翻译任务文本。
- 注册 selection context menu。
- 处理菜单点击：读取 selection/tabId，启动 `ask` run，绑定并打开 side panel。

## Safety

该能力只读，不从 content script 直接调用 provider，也不执行页面工具。选中文本作为用户明确选择的输入进入任务；后续 provider prompt、domain consent、脱敏和错误处理继续沿用现有 runtime 边界。

## Testing

覆盖：

- manifest 包含 `contextMenus` 权限。
- 菜单注册仅出现在 selection context。
- 空 selection 不启动 run。
- 解释菜单生成中文解释任务并打开对应 run。
- 翻译菜单生成中文翻译任务并打开对应 run。
