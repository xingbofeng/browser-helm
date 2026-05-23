# finding

## 用途

定义 BrowserHelm 面向用户的诊断结论、证据链和不确定性表达。

## 状态

v1.0 起作为 Page Inspector + Form Doctor 的输出契约。

## 类型草案

```ts
type Confidence = 'low' | 'medium' | 'high';

type Evidence = {
  source: 'observation' | 'form' | 'debug' | 'tool_result' | 'user';
  summary: string;
  refId?: string;
  traceEventId?: string;
};

type AgentFinding = {
  title: string;
  explanation: string;
  evidence: Evidence[];
  confidence: Confidence;
};

type DebugReport = {
  title: string;
  findings: AgentFinding[];
  recommendations: string[];
  limitations?: string[];
};
```

## 规则

- Debug/Form 结论必须带 evidence。
- 不确定原因必须用 `confidence: 'low' | 'medium'`，不能伪装成确定结论。
- 用户可见报告使用 DebugReport；trace 保留完整 ToolResult 和结构化 evidence。
