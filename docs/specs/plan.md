# plan

## 用途

定义 BrowserHelm 的轻量计划契约。Plan 是 loop 的路线图，不替代 AgentLoop，也不是 v0.1 的正式能力。

## 状态

v0.1 只预留 goal/current step/trace，不实现 planner。v1.0 起实现 mode-based lightweight plan。v1.2 成功 plan 可沉淀为 workflow draft。

## 类型草案

```ts
type PlanStepStatus = 'pending' | 'current' | 'done' | 'skipped' | 'blocked';

type PlanStep = {
  id: string;
  title: string;
  status: PlanStepStatus;
  expectedTool?: string;
  evidence?: string[];
};

type PlanState = {
  id: string;
  mode: 'ask' | 'debug' | 'form' | 'act';
  steps: PlanStep[];
  updatedAt: number;
};

type PlanProgressSummary = {
  done: string[];
  current?: string;
  pending: string[];
};
```

## 规则

- v0.1 不生成 PlanState。
- v1.0 只做 mode template + task + observation summary，不做通用 planner agent。
- 完整 PlanState 进入 trace / storage。
- 模型上下文只接收 PlanProgressSummary。
- Plan 是 guide，不是 prison；无表单、权限不足、ref stale、用户 interrupt 时可以动态修改。
- v1.2 成功 plan 只能生成 workflow draft，必须经过 replay preview / approval 后才能复用。
