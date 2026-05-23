# approval

## 用途

定义 BrowserHelm 的 approval 契约。

Approval 是 HITL 的协议核心。AgentLoop 不直接弹窗；runtime 创建 approval request，UI 通过 RuntimePort 展示，用户决策再恢复或终止 run。

## 状态

v0.1 协议雏形，v0.33 runtime hook，v0.4 UI 原型，v1.0 正式安全能力。

## 类型草案

```ts
type ToolRisk = 'safe' | 'low' | 'medium' | 'high';

type ApprovalRequest = {
  id: string;
  runId: string;
  stepId: string;
  tool: string;
  argsPreview: unknown;
  risk: ToolRisk;
  reason: string;
  actionPreview?: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: number;
  decidedAt?: number;
};

type ApprovalDecision = {
  requestId: string;
  decision: 'approved' | 'denied';
  reason?: string;
  decidedAt: number;
};

type ApprovalAuditEvent = {
  id: string;
  runId: string;
  stepId: string;
  requestId: string;
  status: 'requested' | 'approved' | 'denied' | 'expired';
  summary: string;
};
```

## 规则

- `high` risk 默认需要 approval。
- submit、send、delete、payment、upload、clipboard、execute JS、workflow replay 必须 approval。
- v0.1 只定义 `USER_DENIED_APPROVAL` 错误码和 schema，不实现真实 approve / deny lifecycle。
- 用户 deny 后返回 `USER_DENIED_APPROVAL` ToolResult 的完整流程放到 v0.33 / v0.4 / v1.0 落地。
- 完整 ApprovalRequest 写入 trace。
- 模型上下文只接收 approval summary。
- v0.1 只做最小 `ApprovalPolicy` / `RiskClassifier`；正式 `PolicyEngine` 后续统一承接 Skill、MCP、workflow replay、sub-agent 等能力。

## 后续落地

该 spec 后续会转成 `src/shared/schemas/` 下的 Zod schema。
