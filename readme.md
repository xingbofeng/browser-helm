<p align="center">
  <img src="docs/browserhelm-logo.png" alt="BrowserHelm Logo" width="128" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-v1.0-blue" alt="Status" />
  <img src="https://img.shields.io/badge/runtime-browser_extension-2ea44f" alt="Runtime" />
  <img src="https://img.shields.io/badge/architecture-local--first-black" alt="Architecture" />
  <img src="https://img.shields.io/badge/agent-a11y--first-6f42c1" alt="Agent" />
  <img src="https://img.shields.io/badge/backend-none-orange" alt="Backend" />
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="Language" />
  <img src="https://img.shields.io/badge/UI-React-61dafb" alt="UI" />
  <img src="https://img.shields.io/badge/memory-local--first-0969da" alt="Memory" />
  <img src="https://img.shields.io/badge/tools-bh__prefix-black" alt="Tools" />
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="License" />
</p>

<h1 align="center">BrowserHelm · 浏览器舵手</h1>

<p align="center">
  <strong>先看懂页面，再安全执行。</strong><br />
  一个跑在你浏览器里的本地优先 AI 页面助手。
</p>

<p align="center">
  <a href="README_EN.md">English</a>
</p>

---

## 产品定位

**BrowserHelm（浏览器舵手）** 是一个本地优先的浏览器 AI Agent。它作为 Chrome 扩展直接运行在你的浏览器中，能看懂页面、诊断问题、帮你理解表单为什么填不了，并在你的允许下安全执行操作。

它不是云浏览器，不是后端自动化，也不是通用 Agent SDK 的 UI 壳。BrowserHelm 的核心是自己的 Agent Kernel：观察页面 → 分析问题 → 请示风险 → 执行工具 → 验证结果 → 记录 trace，每一步都清楚展示给你。

## 当前能力 (v1.0)

BrowserHelm 的首个可发布版本定位为 **Page Inspector + Form Doctor**。

**页面诊断** — 一眼看懂页面健康状况：
- 页面为什么报错？
- Console / Network 有什么异常？
- 当前页面状态概览（标题、来源、交互元素数量）

**表单医生** — 帮你排查表单问题：
- 哪些必填项缺失？
- 哪个按钮为什么 disabled？
- 表单验证错误在哪？
- 提交按钮的关联状态如何？

**安全执行** — 高风险动作必须经过你审批：
- 提交、发送、删除、发布、执行 JS 等操作默认阻断
- approval 面板清晰展示要做什么、风险多大
- 你决定执行还是拒绝

**本地优先** — 你的数据归你：
- 核心 Agent loop、memory、trace、配置全在本地
- 不需要后端，不需要注册任何服务
- 未来云同步仅作为可选增强

**可复盘可追溯** — Agent 每步都可见：
- 消息瀑布流展示 Agent 看到了什么、做了什么
- trace 事件完整记录决策过程
- 高级开发者选项提供完整诊断面板

## 安装

BrowserHelm 是一款 Chrome 扩展。目前已支持开发者模式手动加载，后续将上架 Chrome Web Store。

**开发者模式安装：**

```bash
git clone https://github.com/your-org/browser-helm.git
cd browser-helm
npm install
npm run build
```

然后在 Chrome 中：

1. 打开 `chrome://extensions`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `.output/chrome-mv3` 目录

**配置模型：**

BrowserHelm 不内置任何模型服务。首次使用需要配置：
1. 点击右侧栏顶部齿轮图标进入模型配置
2. 填入你已有的 OpenAI 兼容 API 信息（支持自定义 Base URL）
3. 点击测试连接确认可用

## 使用场景

| 场景 | 描述 |
|------|------|
| **前端调试** | 打开目标页面，让 BrowserHelm 观察并诊断 console / network 异常 |
| **表单排查** | 面对复杂的表单，让 BrowserHelm 找出缺失必填项和 disabled 原因 |
| **页面理解** | 快速获取页面结构概览：title、来源、交互元素、表单字段 |
| **安全执行** | 在需要操作页面时，通过审批流程安全执行高风险动作 |

## 技术栈

- **扩展框架**：[WXT](https://wxt.dev/)
- **界面**：React + [Animal Island UI](https://github.com/guokaigdg/animal-island-ui)（动物森友会视觉主题）
- **语言**：TypeScript
- **Schema**：Zod
- **本地存储**：Dexie.js (IndexedDB)
- **状态管理**：Zustand
- **模型层**：自研 OpenAI 兼容 REST Client，支持 BYOK

## 路线图

- **v1.0** — Page Inspector + Form Doctor：第一个可发布版本，只读诊断 + 安全审批
- **v1.1** — Assisted Form Fill + Frontend Debug：辅助填表、表单验证、深度调试面板
- **v1.2** — Memory + Workflow Replay：本地记忆、工作流复盘
- **v1.3** — DevTools/CDP 深度集成：Network 详情、Performance、Response Body
- **v1.4** — Vision/Screenshot Agent：视觉理解、布局分析
- **v1.5** — 高级浏览器工具：多标签、iframe、Shadow DOM、文件/剪贴板
- **v1.6** — 领域适配器：GitHub、Gmail、Notion、Linear 等
- **v2.0** — 完整浏览器 Agent 平台

## 开发

```bash
# 启动开发模式
npm run dev

# 类型检查
npm run typecheck

# 运行测试
npm test

# E2E 测试
npm run test:e2e

# 扩展调试
npm run debug:extension:watch
```

## 开源协议

本项目采用 MIT License 开源协议。

---

<p align="center">
  <sub>Made with ❤️ for people who build on the web</sub>
</p>
