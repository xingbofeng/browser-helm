import { describe, expect, it } from 'vitest';

import { AgentLoop } from '../../../../src/agent/kernel/AgentLoop';
import { ContextBuilder } from '../../../../src/agent/context/ContextBuilder';
import { DecisionParser } from '../../../../src/agent/parser/DecisionParser';
import { MockModelClient } from '../../../../src/agent/model/MockModelClient';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { InMemoryTraceRecorder } from '../../../../src/storage/memory/in-memory-trace-recorder';

describe('AgentLoop integration - missing tool failure', () => {
  it('fails when requested tool is not registered', async () => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_missing_tool',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Call missing tool',
      maxSteps: 3
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('TOOL_NOT_FOUND');
    const toolResult = result.trace.find((event) => event.type === 'tool_result');
    expect(toolResult).toBeDefined();
    if (!toolResult || toolResult.type !== 'tool_result') {
      throw new Error('expected tool_result event');
    }
    expect(toolResult.payload.tool).toBe('bh_missing_tool');
    expect(toolResult.payload.result.code).toBe('TOOL_NOT_FOUND');
    expect(toolResult.payload.result.error).toBeDefined();
    expect(toolResult.payload.result.error?.detail).toEqual({ retryable: false });
  });
});
