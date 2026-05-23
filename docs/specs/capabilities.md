# capabilities

## 用途

定义模型、工具、runtime 权限和 domain boundary 的能力声明，供 ToolSelector 和 PolicyEngine 使用。

## 状态

v0.1 有 ModelClient capability skeleton，v1.0 正式用于 ToolSelector。

## 类型草案

```ts
type ModelCapabilities = {
  supportsStructuredOutput: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  maxContextTokens?: number;
};

type ToolCapabilities = {
  requiresPage?: boolean;
  requiresActiveTab?: boolean;
  requiresApproval?: boolean;
  requiresDebugger?: boolean;
  requiresClipboard?: boolean;
  requiresDownloads?: boolean;
};

type RuntimeCapabilities = {
  hasDebuggerPermission: boolean;
  hasClipboardPermission: boolean;
  hasDownloadsPermission: boolean;
  hasActiveTab: boolean;
  hostPermissions: string[];
};

type DomainBoundary = {
  currentDomain: string;
  allowedDomains: string[];
  blockedDomains?: string[];
};
```

## 规则

- ToolSelector 不能暴露当前权限不可用的工具。
- CDP tools 需要 debugger capability。
- Clipboard tools 需要 clipboard capability。
- Workflow replay 不能跨 domain 静默执行。
- Skill、MCP、sub-agent tools 也必须声明 capability。
