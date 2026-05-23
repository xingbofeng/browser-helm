# tool spec

## 用途

定义 BrowserHelm 的 tool spec 契约。

## 状态

v0.1 起作为 tool registry 的核心契约。

## 类型草案

```ts
type ToolRisk = 'safe' | 'low' | 'medium' | 'high';

type ToolMode =
  | 'ask'
  | 'debug'
  | 'form'
  | 'act'
  | 'vision'
  | 'advanced'
  | 'memory'
  | 'internal';

type ToolSpec<TArgs, TResult> = {
  name: string;
  title: string;
  description: string;
  modes: ToolMode[];
  risk: ToolRisk;
  argsSchema: ZodSchema<TArgs>;
  resultSchema: ZodSchema<TResult>;
  execute(args: TArgs, ctx: ToolContext): Promise<ToolResult<TResult>>;
};
```

v0.1 采用完整 ToolSpec 形态，但不做正式 ToolSelector：

- mock/internal 工具优先使用 `modes: ['internal']`。
- 面向问答的只读工具可以使用 `modes: ['ask']`。
- `debug`、`form`、`act`、`vision`、`advanced`、`memory` 作为协议枚举保留，后续版本再接入模式系统和动态工具裁剪。

## 风险规则

- `safe`：纯内部或 mock，不触碰真实页面。
- `low`：只读页面或配置读取。
- `medium`：可能改变页面状态的普通动作。
- `high`：提交、删除、支付、上传、剪贴板、执行 JS、workflow replay 等需要 approval 的动作。

v0.1 中 ToolRouter 执行前只经过最小 `ApprovalPolicy` / `RiskClassifier`，用于表达 risk、`requiresApproval`、`approval_required` trace 和 `waiting_for_approval` 状态。

正式 `PolicyEngine` 放到后续版本：它会统一处理权限、approval、domain policy、skill、MCP、workflow replay 和 sub-agent 调用。这里的意思是后续所有工具执行都必须走同一条策略入口，不能让某类工具绕过安全检查；v0.1 只先打下最小协议地基。

## 后续落地

该 spec 后续会转成 `src/shared/schemas/` 下的 Zod schema。
