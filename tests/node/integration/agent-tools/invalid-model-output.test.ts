import { describe, expect, it } from 'vitest';

import { AgentLoop } from '../../../../src/agent/kernel/AgentLoop';
import { ContextBuilder } from '../../../../src/agent/context/ContextBuilder';
import { DecisionParser } from '../../../../src/agent/parser/DecisionParser';
import { MockModelClient } from '../../../../src/agent/model/MockModelClient';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { InMemoryTraceRecorder } from '../../../../src/storage/memory/in-memory-trace-recorder';

describe('AgentLoop integration - invalid model output', () => {
  it('fails with parse error and keeps raw output in trace', async () => {
    const registry = new ToolRegistry();
    const traceRecorder = new InMemoryTraceRecorder();
    const loop = new AgentLoop({
      modelClient: new MockModelClient(['not-json']),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder
    });

    const result = await loop.run({
      task: 'Observe page',
      maxSteps: 2
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('MODEL_OUTPUT_INVALID_JSON');
    const parseFailed = result.trace.find(
      (event) => event.type === 'decision_parse_failed'
    );
    expect(parseFailed).toBeDefined();
    if (!parseFailed || parseFailed.type !== 'decision_parse_failed') {
      throw new Error('expected decision_parse_failed event');
    }
    expect(parseFailed.payload.parseError.code).toBe('MODEL_OUTPUT_INVALID_JSON');
    expect(parseFailed.payload.promptVersion).toBe('v0.1.0');
    expect(parseFailed.payload.toolSchemaVersion).toBe('v0.1.0');
    expect(parseFailed.payload.contextPolicyVersion).toBe('v0.1.0');
    expect(parseFailed.payload.schemaVersion).toBe('1.0.0');
  });
});
