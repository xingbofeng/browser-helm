<p align="center">
  <img src="docs/browserhelm-logo.png" alt="BrowserHelm Logo" width="96" />
</p>

<h1 align="center">BrowserHelm</h1>
<h3 align="center">浏览器舵手 — 本地优先的浏览器 AI Agent</h3>

<p align="center">
  <a href="https://browser-helm.counterxing.top"><strong>🌐 browser-helm.counterxing.top</strong></a> &nbsp;·&nbsp;
  <a href="#-快速开始"><strong>🚀 快速开始</strong></a> &nbsp;·&nbsp;
  <a href="docs/"><strong>📖 文档</strong></a>
</p>

<p align="center">
  <a href="README_EN.md">🇺🇸 English</a> &nbsp;|&nbsp;
  <strong>🇨🇳 中文</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-v1.6.0-blue?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/runtime-Chrome_Extension-2ea44f?style=flat-square" alt="Runtime" />
  <img src="https://img.shields.io/badge/架构-本地优先-black?style=flat-square" alt="Architecture" />
  <img src="https://img.shields.io/badge/Agent-a11y--first-6f42c1?style=flat-square" alt="Agent" />
  <img src="https://img.shields.io/badge/后端-不需要-orange?style=flat-square" alt="Backend" />
  <img src="https://img.shields.io/badge/语言-TypeScript-3178c6?style=flat-square" alt="Language" />
  <img src="https://img.shields.io/badge/UI-React_+_Animal_Island-61dafb?style=flat-square" alt="UI" />
  <img src="https://img.shields.io/badge/许可-MIT-lightgrey?style=flat-square" alt="License" />
</p>

> **先看懂页面，再安全执行。** BrowserHelm 是一个跑在你浏览器里的 AI 页面助手——无需 BrowserHelm 自有后端，不绑定模型。使用云 AI provider 时，裁剪/脱敏后的页面上下文会发送到你配置的 provider 端点；BrowserHelm 本身不收集或存储你的数据。

---

## ✨ 为什么选择 BrowserHelm？

| | BrowserHelm | 其他浏览器 Agent |
|---|---|---|
| 🔒 **数据隐私** | BrowserHelm 本体本地运行；云模型直连你配置的 provider | 通常需要云服务中转 |
| 🧠 **模型自由** | BYOK，用你自己的 API Key | 通常绑定特定模型 |
| 👁️ **先观察后执行** | 强制页面观察 → 风险审批 → 执行 | 直接操作，缺乏透明度 |
| 📋 **完整可追溯** | 每一步都有结构化 trace 记录 | 黑盒操作 |
| 🎨 **开源透明** | MIT 协议，代码完全开放 | 多数闭源 |
| 🔌 **零后端** | 不需要服务器，不需要注册 | 多数依赖云后端 |

---

## 🧩 能力

### 🔍 页面理解

自动观察任意网页，生成结构化页面数据——标题、来源、表单字段、交互元素、无障碍快照、iframe 关系。支持长页面滚动读取、iframe 内容穿透。不用翻 DevTools，一眼看清页面全貌。

### 🩺 表单医生

完整的表单诊断 + 辅助填写链路：

- **诊断**：自动识别缺失必填项、验证错误、disabled 提交按钮的根本原因
- **推断**：根据用户意图和字段快照，自动推断填写方案（含来源、置信度、脱敏预览）
- **执行**：单字段或批量安全填写，触发完整 input/change/blur 事件
- **验证**：填写后自动校验 HTML5 有效性、必填项、可见错误文本
- **提交**：高风险提交必须经过审批面板确认

### 🖱️ 交互元素操作

读取任意元素的状态（visible、disabled、checked、selected），并检查动作就绪度（目标校验、风险预判、approval 预判）。当前公开工具面不暴露通用元素点击、输入或 iframe 内修改动作。

### 🛡️ 安全审批

提交、删除、执行 JS 等高风险操作默认阻断。审批面板清晰展示操作预览、风险等级和原因，由你决定执行还是拒绝。PolicyEngine 贯穿所有工具执行路径，不可绕过。

### 🧠 Agent 智能内核

自研 Agent Kernel 驱动完整循环：

> 页面观察 → 上下文裁剪 → 工具选择 → 风险审批 → 执行 → 结果验证 → trace 记录

- **TaskClassifier** 自动分类用户任务类型
- **ToolSelector** 基于 run mode 和权限过滤可用工具
- **ContextCompactor** 将完整页面数据裁剪为模型上下文友好的摘要
- **RecoveryPolicy** 处理工具失败和异常恢复
- 支持 Ask（只读提问）和 Act（安全执行）双模式
> 📝 关于 Agent 核心层设计理念，见 [《Agent 工程化的代价：我们怎么把 prompt 规则全挪进了 runtime》](docs/agentic-experience.md)

### 📊 可追溯 & 可调试

- 消息瀑布流完整展示 Agent 的思考→决策→执行→结果全过程
- 结构化 trace 记录每一步的决策、工具调用、参数和结果
- 高级开发者面板提供完整 trace 回放和诊断报告
- 流式模型输出实时可见
- 调试模式支持 `bh_debug_collect_page_health` 按需启用 Page Health Hook，收集本地 Console Error / Network Failure 摘要（需开启 Debug run mode）

### 🔌 模型自由

不内置任何模型服务。支持所有 OpenAI 兼容接口，包括 Ollama、vLLM、DeepSeek、通义千问等本地或云端模型。自定义 Base URL，API Key 保存在 `chrome.storage.local`，不会进入 trace 或发送到 BrowserHelm 自有后端。

### 🏠 本地优先

Agent 核心循环、trace 和配置基于 chrome.storage.local 在浏览器本地运行。不依赖 BrowserHelm 自有后端服务器，不需要注册 BrowserHelm 服务账号。使用云端模型时，裁剪/脱敏后的页面上下文会发送到你配置的 provider 端点。

---

## 🛠️ 内置工具

BrowserHelm 内置 **92 个 `bh_` 前缀工具**，覆盖页面观察、表单诊断、元素读取、iframe 只读读取、无障碍快照、DevTools/CDP、视觉检查、advanced browser state 检查、本地记忆/工作流和站点 adapter 等场景。工具按领域分模块管理：

| 模块 | 工具 | 说明 |
|---|---|---|
| 🧠 Agent | `bh_agent_finish` `bh_agent_fail` `bh_agent_ask_user` | run 级状态控制 |
| 📄 页面 | `bh_page_observe` `bh_frame_list` | 页面观察、frame 发现 |
| ♿ 无障碍 | `bh_a11y_snapshot` `bh_a11y_find_interactive` `bh_a11y_refresh_refs` `bh_a11y_resolve_ref` | a11y 快照、ref 映射 |
| 🖱️ 元素 | `bh_element_inspect` `bh_element_read_state` `bh_action_check_readiness` | 元素检查、动作就绪 |
| 📝 表单 | `bh_form_list` `bh_form_inspect` `bh_form_read_fields` `bh_form_find_missing_required` `bh_form_find_validation_errors` `bh_form_find_disabled_submit_reason` `bh_form_infer_fill_plan` `bh_form_fill_field` `bh_form_fill_many` `bh_form_verify` `bh_form_submit_with_approval` | 完整表单诊断、填写、验证、审批链路 |
| 🖼️ iframe | `bh_iframe_read` | iframe 内容读取 |
| 🔧 调试 | `bh_debug_collect_page_health` `bh_cdp_attach` `bh_cdp_get_network_events` `bh_cdp_get_console_events` | 页面健康诊断与 CDP deep inspect |
| 👁️ 视觉 | `bh_vision_capture_viewport` `bh_vision_describe_viewport` `bh_vision_detect_overlay` `bh_pointer_click` | screenshot/vision 增强、DOM fallback 与坐标点击最后手段 |
| 🗂️ 高级浏览器 | `bh_tab_list` `bh_tab_get_active` `bh_tab_focus` `bh_shadow_list` `bh_shadow_query` `bh_storage_list` `bh_storage_set_with_approval` `bh_download_list` `bh_doc_read_url` | 多标签上下文、Shadow DOM、Web Storage 审批写操作、下载元数据与文档/PDF 读取 |
| 🧩 记忆/工作流 | `bh_memory_lookup` `bh_pad_append` `bh_flow_preview` `bh_flow_run_with_approval` | 本地 domain memory、scratchpad 和 workflow replay |
| 🧭 站点 Adapter | `bh_adapter_detect_site` `bh_adapter_list_workflows` `bh_adapter_apply_locator` `bh_adapter_report_failure` | 站点 guidance、workflow/locator hint、失败记录和通用工具 fallback |

详见 [src/tools/README.md](src/tools/README.md)。

---

<p align="center">
  <img src="docs/browserhelm-hero.png" alt="BrowserHelm 产品截图" width="100%" />
</p>

## 🚀 快速开始

### 安装

```bash
git clone https://github.com/xingbofeng/browser-helm.git
cd browser-helm
npm install
npm run build
```

在 Chrome 中：

1. 打开 `chrome://extensions`，开启「开发者模式」
2. 点击「加载已解压的扩展程序」
3. 选择 `.output/chrome-mv3` 目录

### 配置模型

BrowserHelm 不内置模型，使用你自己的 API Key：

1. 点击右侧栏齿轮图标 → 模型配置
2. 填入 OpenAI 兼容 API 信息（支持自定义 Base URL）
3. 测试连接 → 开始使用

> 兼容 Ollama、vLLM、DeepSeek、通义千问等所有 OpenAI 兼容接口。

### 使用

1. 打开任意网页 → 点击 Chrome 工具栏 BrowserHelm 图标
2. 选择「提问模式」（只读诊断）或「执行模式」（安全操作）
3. 输入你的任务——Agent 会自动观察页面并开始工作

---

## 🛠️ 技术栈

| 层面 | 技术 |
|---|---|
| 扩展框架 | [WXT](https://wxt.dev/) |
| 前端 | React + [Animal Island UI](https://github.com/guokaigdg/animal-island-ui) |
| 语言 | TypeScript (strict) |
| 数据校验 | Zod |
| 本地存储 | chrome.storage.local |
| 状态管理 | Zustand |
| 模型层 | 自研 OpenAI 兼容 REST Client |
| 测试 | Vitest + Playwright |

---

## 🧑‍💻 开发

```bash
npm run dev          # 启动开发模式
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint
npm test             # 单元/集成测试
npm run test:e2e     # E2E 测试
npm run debug:extension:watch  # 扩展调试（自动 rebuild + 重启）
```

详见 [AGENTS.md](AGENTS.md) 了解项目规范。

---

## 🤝 贡献

欢迎提交 Issue 和 PR！请先阅读 [AGENTS.md](AGENTS.md) 了解项目结构和开发规范。

---

## 📄 许可

[MIT License](LICENSE)

---

<p align="center">
  <sub>Made with ❤️ for people who build on the web</sub>
</p>
