# agent decision

## 用途

定义 BrowserHelm 的 agent decision 契约。

## 状态

v0.1 起作为 DecisionParser 的核心输出契约。

## 类型草案

```ts
type AgentDecision =
  | {
      type: 'tool_call';
      tool: string;
      args: Record<string, unknown>;
      reason?: string;
    }
  | {
      type: 'ask_user';
      question: string;
    }
  | {
      type: 'finish';
      message: string;
    }
  | {
      type: 'fail';
      message: string;
      code?: string;
    };
```

## 规则

- v0.1 不包含 `delegate_to_agent`。
- parser 必须拒绝旧形态 `type: "tool"`。
- raw model output 必须写入 trace，再尝试 parse。
- parse failure 进入 RunFailure 或 ToolResult，不允许 throw 穿透 UI/runtime 边界。

## 后续落地

该 spec 后续会转成 `src/shared/schemas/` 下的 Zod schema。
