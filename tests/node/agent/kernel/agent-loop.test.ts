import { describe, expect, it } from 'vitest';

import { ContextBuilder } from '../../../../src/agent/context/context-builder';
import { AgentLoop } from '../../../../src/agent/kernel/agent-loop';
import { DecisionParser } from '../../../../src/agent/parser/decision-parser';
import { MockModelClient } from '../../../../src/agent/model/mock-model-client';
import { InMemoryTraceRecorder } from '../../../../src/storage/memory/in-memory-trace-recorder';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { bhAgentAskUser } from '../../../../src/tools/agent/bh-agent-ask-user';
import { bhAgentFinish } from '../../../../src/tools/agent/bh-agent-finish';
import { z } from 'zod';

describe('agent-loop', () => {
  it('fails with MAX_STEPS_EXCEEDED when no finish is produced', async () => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'ask_user',
          question: 'Need confirmation'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Need interaction',
      maxSteps: 1
    });

    expect(result.status).toBe('paused');
  });

  it('records approval_required and closes turn span when waiting for approval', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_needs_approval',
      title: 'Needs Approval',
      description: 'Returns requiresApproval result',
      modes: ['internal'],
      risk: 'high',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string(),
        requiresApproval: z.boolean(),
        approval: z.object({
          reason: z.string(),
          risk: z.enum(['safe', 'low', 'medium', 'high'])
        })
      }),
      execute: async () => ({
        ok: false,
        code: 'APPROVAL_REQUIRED',
        summary: 'Need explicit approval',
        requiresApproval: true,
        approval: {
          reason: 'High-risk action preview',
          risk: 'high'
        }
      })
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_needs_approval',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Run high risk action',
      maxSteps: 2
    });

    expect(result.status).toBe('waiting_for_approval');
    expect(result.trace.some((event) => event.type === 'approval_required')).toBe(true);

    const turnFinished = result.trace.find((event) => event.type === 'turn_finished');
    expect(turnFinished).toBeDefined();
    if (!turnFinished || turnFinished.type !== 'turn_finished') {
      throw new Error('expected turn_finished event');
    }
    expect(turnFinished.payload.status).toBe('waiting_for_approval');
    expect(turnFinished.payload.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('uses injected runtime metadata for run_started trace', async () => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'finish',
          message: 'done'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder(),
      runtimeMetadata: {
        model: 'gpt-5-mini',
        providerBaseUrl: 'https://api.example.com/v1'
      }
    });

    const result = await loop.run({
      task: 'metadata check',
      maxSteps: 1
    });

    const runStarted = result.trace.find((event) => event.type === 'run_started');
    expect(runStarted).toBeDefined();
    if (!runStarted || runStarted.type !== 'run_started') {
      throw new Error('expected run_started event');
    }
    expect(runStarted.payload.metadata.model).toBe('gpt-5-mini');
    expect(runStarted.payload.metadata.runMode).toBe('ask');
    expect(runStarted.payload.metadata.providerBaseUrl).toBe(
      'https://api.example.com/v1'
    );
  });

  it('records explicit run mode and only exposes mode-available tools to the model', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_page_observe',
      title: 'Observe',
      description: 'Observe page',
      modes: ['ask'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'observed'
      })
    });
    registry.register({
      name: 'bh_form_read_fields',
      title: 'Read Fields',
      description: 'Read fields',
      modes: ['form'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'fields'
      })
    });
    registry.register({
      name: 'bh_debug_only',
      title: 'Debug Only',
      description: 'Debug',
      modes: ['debug'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'debug'
      })
    });

    let systemPrompt = '';
    const loop = new AgentLoop({
      modelClient: {
        complete: async (input) => {
          systemPrompt = input.messages[0]?.content ?? '';
          return {
            text: JSON.stringify({
              type: 'finish',
              message: 'done'
            })
          };
        }
      },
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Diagnose form',
      mode: 'form',
      maxSteps: 1
    });
    const runStarted = result.trace.find((event) => event.type === 'run_started');

    expect(systemPrompt).toContain('Current run mode: form');
    expect(systemPrompt).toContain('bh_page_observe');
    expect(systemPrompt).toContain('bh_form_read_fields');
    expect(systemPrompt).not.toContain('bh_debug_only');
    expect(runStarted).toBeDefined();
    if (!runStarted || runStarted.type !== 'run_started') {
      throw new Error('expected run_started event');
    }
    expect(runStarted.payload.metadata.runMode).toBe('form');
  });

  it('passes registered tool names into context builder', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_page_observe',
      title: 'Mock Observe',
      description: 'Observes the current page',
      modes: ['internal'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'Observed page'
      })
    });

    const contextBuilder = new ContextBuilder();
    let capturedToolNames: string[] | undefined;
    const originalBuild = contextBuilder.build.bind(contextBuilder);
    contextBuilder.build = (input) => {
      capturedToolNames = input.toolNames;
      return originalBuild(input);
    };

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'finish',
          message: 'done'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder,
      traceRecorder: new InMemoryTraceRecorder()
    });

    await loop.run({
      task: 'Observe page',
      maxSteps: 1
    });

    expect(capturedToolNames).toEqual(['bh_mock_page_observe']);
  });

  it('fails gracefully when model client throws', async () => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop({
      modelClient: {
        complete: async () => {
          const error = new Error('provider missing');
          Object.assign(error, {
            code: 'PROVIDER_NOT_CONFIGURED'
          });
          throw error;
        }
      },
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Observe page',
      maxSteps: 1
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('PROVIDER_NOT_CONFIGURED');
    expect(result.trace.some((event) => event.type === 'run_failed')).toBe(true);
  });

  it('blocks high-risk tools before execution and records approval trace', async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      name: 'bh_mock_high_risk',
      title: 'High Risk',
      description: 'High risk mock',
      modes: ['ask'],
      risk: 'high',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string(),
        nextHints: z.array(z.string()).optional()
      }),
      execute: async () => {
        executed = true;
        return {
          ok: true,
          code: 'OK',
          summary: 'done',
          nextHints: ['Finish after high risk tool']
        };
      }
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_high_risk',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Run tool',
      maxSteps: 2
    });
    const toolStarted = result.trace.find((event) => event.type === 'tool_started');
    const toolResult = result.trace.find((event) => event.type === 'tool_result');
    const approvalRequired = result.trace.find(
      (event) => event.type === 'approval_required'
    );

    expect(result.status).toBe('waiting_for_approval');
    expect(executed).toBe(false);
    expect(toolStarted).toBeDefined();
    if (!toolStarted || toolStarted.type !== 'tool_started') {
      throw new Error('expected tool_started event');
    }
    expect(toolStarted.payload.risk).toBe('high');
    expect(toolStarted.payload.modes).toEqual(['ask']);
    expect(toolResult).toBeDefined();
    if (!toolResult || toolResult.type !== 'tool_result') {
      throw new Error('expected tool_result event');
    }
    expect(toolResult.payload.result.code).toBe('APPROVAL_REQUIRED');
    expect(approvalRequired).toBeDefined();
  });

  it('redacts sensitive iframe type text from trace and approval previews', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_iframe_type',
      title: 'Type In Iframe Target',
      description: 'Types into iframe',
      modes: ['act'],
      risk: 'medium',
      argsSchema: z.object({
        refId: z.string(),
        text: z.string(),
        valuePreview: z.object({
          masked: z.boolean(),
          preview: z.string(),
          reason: z.string().optional()
        })
      }),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string(),
        requiresApproval: z.boolean(),
        approval: z.object({
          reason: z.string(),
          risk: z.enum(['safe', 'low', 'medium', 'high']),
          actionPreview: z.string()
        })
      }),
      execute: async () => ({
        ok: false,
        code: 'APPROVAL_REQUIRED',
        summary: 'Need approval',
        requiresApproval: true,
        approval: {
          reason: 'Sensitive input',
          risk: 'high',
          actionPreview: 'Type [MASKED] into frame_7:ref_201'
        }
      })
    });
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_iframe_type',
          args: {
            refId: 'frame_7:ref_201',
            text: 'super-secret',
            valuePreview: {
              masked: true,
              preview: '[MASKED]',
              reason: 'password'
            }
          }
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Type password',
      mode: 'act',
      maxSteps: 2
    });

    expect(JSON.stringify(result.trace)).not.toContain('super-secret');
    expect(JSON.stringify(result.trace)).toContain('[MASKED]');
  });

  it('records tool_failed with retryable', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_retryable',
      title: 'Retryable',
      description: 'Returns retryable failure',
      modes: ['internal'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string(),
        error: z.object({
          message: z.string(),
          detail: z.object({
            retryable: z.boolean()
          })
        }),
        nextHints: z.array(z.string())
      }),
      execute: async () => ({
        ok: false,
        code: 'TOOL_EXECUTION_FAILED',
        summary: 'temporary failure',
        error: {
          message: 'temporary failure',
          detail: {
            retryable: true
          }
        },
        nextHints: ['Retry with safer args']
      })
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_retryable',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Run retryable tool',
      maxSteps: 2
    });
    const toolFailed = result.trace.find((event) => event.type === 'tool_failed');
    const runFailed = result.trace.find((event) => event.type === 'run_failed');

    expect(toolFailed).toBeDefined();
    if (!toolFailed || toolFailed.type !== 'tool_failed') {
      throw new Error('expected tool_failed event');
    }
    expect(toolFailed.payload.retryable).toBe(true);
    expect(runFailed).toBeDefined();
    if (!runFailed || runFailed.type !== 'run_failed') {
      throw new Error('expected run_failed event');
    }
    expect(runFailed.payload.retryable).toBe(true);
  });

  it('treats bh_agent_finish tool_call as a finished run', async () => {
    const registry = new ToolRegistry();
    registry.register(bhAgentFinish);

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_agent_finish',
          args: {
            message: 'Finished through internal tool'
          }
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Finish with internal tool',
      maxSteps: 2
    });

    expect(result.status).toBe('finished');
    expect(result.message).toBe('Finished through internal tool');
    expect(result.trace.some((event) => event.type === 'run_finished')).toBe(true);
  });

  it('treats bh_agent_ask_user tool_call as a paused run', async () => {
    const registry = new ToolRegistry();
    registry.register(bhAgentAskUser);

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_agent_ask_user',
          args: {
            question: 'Need input?'
          }
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      task: 'Ask user through internal tool',
      maxSteps: 2
    });

    expect(result.status).toBe('paused');
    expect(result.message).toBe('Need input?');
    expect(result.trace.some((event) => event.type === 'run_failed')).toBe(false);
  });
});
