import { describe, expect, it } from 'vitest';

import { AgentLoop } from '../../../../src/agent/kernel/AgentLoop';
import { ContextBuilder } from '../../../../src/agent/context/ContextBuilder';
import { DecisionParser } from '../../../../src/agent/parser/DecisionParser';
import { MockModelClient } from '../../../../src/agent/model/MockModelClient';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { bhAgentFinish } from '../../../../src/tools/mock/bh_agent_finish';
import { bhMockPageObserve } from '../../../../src/tools/mock/bh_mock_page_observe';
import { InMemoryTraceRecorder } from '../../../../src/storage/memory/in-memory-trace-recorder';

describe('AgentLoop integration - mock run finish', () => {
  it('runs tool_call then finish successfully', async () => {
    const registry = new ToolRegistry();
    registry.register(bhMockPageObserve);
    registry.register(bhAgentFinish);

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_page_observe',
          args: {
            page: 'current'
          }
        }),
        JSON.stringify({
          type: 'finish',
          message: 'Done'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Observe current page and finish',
      maxSteps: 5
    });

    expect(result.status).toBe('finished');
    expect(result.message).toBe('Done');
    expect(result.trace.some((event) => event.type === 'run_started')).toBe(true);
    expect(result.trace.some((event) => event.type === 'tool_result')).toBe(true);
    expect(result.trace.some((event) => event.type === 'run_finished')).toBe(true);
  });
});
