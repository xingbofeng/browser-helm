# tool result

## 用途

定义 BrowserHelm 的 tool result 契约。

ToolResult 分两层使用：

- 完整结果写入 trace / storage / UI。
- 模型上下文只接收 ContextCompactor 生成的摘要。

## 状态

v0.1 起作为 core schema，后续所有工具必须统一。

## 类型草案

```ts
type ToolRisk = 'safe' | 'low' | 'medium' | 'high';

type ToolResult<TData = unknown> = {
  ok: boolean;
  code: string;
  summary: string;
  data?: TData;
  error?: {
    message: string;
    detail?: unknown;
  };
  nextHints?: string[];
  changedPage?: boolean;
  requiresObserve?: boolean;
  requiresApproval?: boolean;
  approval?: {
    reason: string;
    risk: ToolRisk;
    actionPreview?: string;
  };
  context?: {
    visibility: 'full' | 'summary' | 'hidden';
    summary?: string;
  };
};
```

## 上下文规则

- `data` 默认不进入模型上下文。
- `summary` 默认进入模型上下文。
- `context.visibility = 'hidden'` 时只写 trace。
- `context.visibility = 'summary'` 时使用 `context.summary` 或 `summary`。
- `context.visibility = 'full'` 只允许短、低风险结果，并受 ContextPolicy 截断。
- approval 详情写入 trace，模型只看 approval summary。

## 后续落地

该 spec 后续会转成 `src/shared/schemas/` 下的 Zod schema。
