# run metadata

## 用途

定义一次 run 的版本、模型、prompt、schema 和 context policy 信息，为 trace replay 和 eval 做准备。

## 状态

v0.1 起写入 trace。

## 类型草案

```ts
type RunMetadata = {
  schemaVersion: string;
  promptVersion: string;
  toolSchemaVersion: string;
  contextPolicyVersion: string;
  model: string;
  providerBaseUrl?: string;
  modelCapabilities?: ModelCapabilities;
};
```

## 规则

- 每个 run 必须记录 RunMetadata。
- trace replay 发现 schema version 不兼容时必须明确提示。
- prompt 修改后必须更新 promptVersion。
- `providerBaseUrl` 可记录 OpenAI-compatible endpoint，便于本地调试和 trace replay。
- `OPENAI_API_KEY` 绝不进入 RunMetadata 或 trace。
