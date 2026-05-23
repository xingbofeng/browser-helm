# Implementation Notes

## Project Scaffold - 2026-05-24

**目标**：创建 BrowserHelm 项目骨架、中文文档、roadmap 版本需求、基础 TypeScript/ESLint/WXT 配置，并移动到 `/Users/counter/workspace/browser-helm`。

**设计决策**：采用 local-first browser extension 架构，使用 WXT + React + TypeScript + Zod + Dexie + Zustand。核心 agent runtime 自研，OpenAI Agents SDK / Vercel AI SDK 不进入早期 core。

**偏差说明**：`docs/design/` 只保留设计图目录，不放 prompt、README 或说明，符合用户要求。Roadmap 每个版本单独一个 md，并使用用户提供的 11 模块格式。

**权衡分析**：
- 完整企业级文档树：优点是细；缺点是维护成本高。
- 高质量 README + docs 精简结构：优点是集中、可维护；缺点是后期可能需要拆分。
- 选择 README + docs 精简结构，因为当前阶段需要规划清晰但不制造文档负担。

**待确认**：
- [ ] v0.3 / v1.0 / v1.1 / v1.2 设计图是否由 GPT 生成后放入 docs/design 对应目录。
- [ ] 是否先按 v0.1 开始实现 Agent Kernel。

## TDD Test Layer Documentation - 2026-05-24

**目标**：补充项目总体架构和每个 roadmap 版本中的测试目录分层，让 TDD 推进时先有明确的测试落位。

**设计决策**：在 `docs/architecture.md` 增加全局 `tests/` 分层，在 `docs/roadmap/README.md` 明确第 8 节必须同时描述 `src/` 与 `tests/`，并在每个版本文档中按版本职责补充 unit、integration、component、e2e、fixtures、helpers 的相关目录。

**偏差说明**：本次只更新规划文档，不创建实际测试文件或引入测试框架，避免在需求未确认前扩大工程改动。

**权衡分析**：
- 直接创建完整 `tests/` 目录：优点是马上可落地；缺点是当前还没有测试框架决策，容易产生空目录或框架假设。
- 先补齐文档分层：优点是明确每个版本的 TDD 边界；缺点是后续实现时还需要创建实际文件。
- 选择先补齐文档分层，因为用户要求是补充版本和总体分层，当前最小改动是文档规划。

**待确认**：
- [ ] 测试框架是否采用 Vitest + React Testing Library + Browser/Codex Browser e2e。
- [ ] 是否在 v0.1 开始实现时同步创建首批 `tests/` 目录和失败测试。

## Git Init and GitHub Repo - 2026-05-24

**目标**：将当前工作区初始化为本地 git 仓库，并在 GitHub 上创建对应的同名仓库。

**设计决策**：采用 `main` 作为默认分支，使用当前登录的 GitHub 账号创建私有仓库，保持与本地项目名 `browser-helm` 一致。

**偏差说明**：本次仅完成仓库初始化与远端建立，不额外改动产品代码或目录结构。

**权衡分析**：
- 先初始化本地再建远端：优点是可以立刻形成首个可推送提交；缺点是多一步提交操作。
- 先建远端再同步本地：优点是流程更短；缺点是本地状态不明确时容易引入额外交互。
- 选择先初始化本地再建远端，因为当前工作区已经有完整项目文件，适合直接形成首个提交。

**待确认**：
- [ ] GitHub 仓库是否需要改为公开。
