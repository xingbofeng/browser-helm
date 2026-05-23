# goal

## 用途

定义 AgentRunInput 的目标和完成条件，让 finish 判断不只依赖模型“感觉完成了”。

## 状态

v0.1 预留字段，v1.0 开始用于 finish 判断。

## 类型草案

```ts
type AgentRunInput = {
  task: string;
  goal?: string;
  successCriteria?: string[];
  maxSteps?: number;
};

type GoalState = {
  goal: string;
  successCriteria: string[];
  satisfiedCriteria: string[];
  unsatisfiedCriteria: string[];
};
```

## 规则

- v0.1 没有显式 goal 时，`goal` 默认等于 `task`，不做额外目标推导。
- v1.0 才允许根据 mode/task 派生更结构化的 goal。
- v1.0 的 Debug/Form run 在 finish 前必须说明满足了哪些 success criteria。
- 如果无法满足完成条件，应该返回 limitation 或 ask_user，而不是强行 finish。
