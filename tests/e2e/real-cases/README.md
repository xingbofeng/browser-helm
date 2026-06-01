# 真实模型 E2E 场景目录

本目录用于承载真实模型 API、真实 Chrome extension runtime 和可审计 trace 的长任务场景。场景按优先级分为 P0、P1、P2；每个场景应是一个完整用户任务，而不是多个碎片化步骤测试。

## 目录

```text
tests/e2e/real-cases/
  p0/          # 发布阻断级真实任务，失败说明核心能力不可用
  p1/          # 高价值主链路任务，覆盖复杂但非发布阻断能力
  p2/          # 扩展覆盖和回归哨兵，覆盖长尾站点、边界和易波动场景
  shared/      # 真实场景通用类型、runner、trace helpers、fixture waiters
```

## 分级原则

P0：必须证明 BrowserHelm 的主价值闭环成立。优先覆盖 Page Inspector、Form Doctor、Assisted Form Fill、长页面读取、真实模型 tool-calling 和安全边界。

P1：覆盖 v1.2-v1.6 的关键增强能力，包括 workflow replay、CDP debug、vision fallback、advanced browser tools 和 domain adapters。

P2：覆盖长尾站点、易波动第三方页面、更多 adapter 组合、更多文档格式和非核心但有回归价值的场景。

## 迁移约定

`tests/e2e/real-cases/index.ts` 是真实模型 suite 的入口，当前聚合 25 个场景：P0 10 个、P1 10 个、P2 5 个。每个新增场景保持独立文件，通过对应优先级目录的 `index.ts` 暴露给 spec；legacy 真实站点场景用同名 wrapper 纳入 P0/P1/P2。
