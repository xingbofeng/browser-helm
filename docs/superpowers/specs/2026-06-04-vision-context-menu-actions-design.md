# Vision Context Menu Actions Design

## Goal

把 Cockpit UI 里已有的三个 Vision 快捷能力补到浏览器右键菜单：

- 截取当前视口
- 截取当前页面长图
- 获取当前页面全部图片

## Product Behavior

右键菜单使用 `BrowserHelm` 分组，避免顶层菜单项过多。菜单项包括：

- 解释选中文字：仅在 selection context 显示。
- 翻译选中文字：仅在 selection context 显示。
- 截取当前视口：在 page、selection、link、image context 显示。
- 截取当前页面长图：在 page、selection、link、image context 显示。
- 获取当前页面全部图片：在 page、selection、link、image context 显示。

点击 Vision 菜单后，background 在当前 tab 上启动一个 `debug` + `observe_only` run，然后执行对应 Vision tool，并打开 Cockpit side panel 到该 run。结果继续由现有 Vision panel 展示、预览和下载。

## Architecture

继续复用 `src/background/selection-context-menu.ts` 作为 BrowserHelm context menu helper，新增 Vision action 类型和 click handling。background entrypoint 仍只负责传入 `RunManager.startRun()`、`RunManager.executeTool()` 和 `openSidePanelForRun()` 依赖。

Vision action 到 tool 的映射：

- `captureViewport` -> `bh_vision_capture_viewport`
- `captureFullPage` -> `bh_vision_batch_capture_full_pages`
- `collectImages` -> `bh_vision_collect_images`

## Safety

三项 Vision 菜单不改页面业务状态，但可能触发页面滚动以完成长图或图片懒加载；这沿用现有 Vision tool 的行为、权限、失败态和数据脱敏策略。右键入口不新增 provider 调用，不把截图原始 dataUrl 写入 trace。

## Testing

覆盖：

- 注册 BrowserHelm 父菜单和五个子菜单。
- 解释/翻译仅 selection context。
- 三项 Vision 菜单覆盖 page/selection/link/image context。
- 解释/翻译点击仍启动 `ask` run。
- Vision 点击启动 `debug` observe-only run，执行对应 tool，并打开 side panel 到该 run。
- 未知菜单或缺少 tabId 不执行 run/tool。
