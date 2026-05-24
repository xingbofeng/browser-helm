import { describe, expect, it } from 'vitest';

import { AgentLoop } from '../../../../src/agent/kernel/agent-loop';
import { ContextBuilder } from '../../../../src/agent/context/context-builder';
import { DecisionParser } from '../../../../src/agent/parser/decision-parser';
import { MockModelClient } from '../../../../src/agent/model/mock-model-client';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { bhAgentFinish } from '../../../../src/tools/agent/bh-agent-finish';
import { bhMockPageObserve } from '../../../helpers/tools/bh-mock-page-observe';
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
