import { describe, expect, it } from 'vitest';

import { ContextBuilder } from '../../../../src/agent/context/context-builder';
import { AgentLoop } from '../../../../src/agent/kernel/agent-loop';
import { DecisionParser } from '../../../../src/agent/parser/decision-parser';
import { MockModelClient } from '../../../../src/agent/model/mock-model-client';
import type {
  ModelClient,
  ModelInput,
  ModelOutput,
  ModelStreamCallbacks
} from '../../../../src/agent/model/model-client';
import { InMemoryTraceRecorder } from '../../../../src/storage/memory/in-memory-trace-recorder';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { bhAgentAskUser } from '../../../../src/tools/agent/bh-agent-ask-user';
import { bhAgentFinish } from '../../../../src/tools/agent/bh-agent-finish';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { z } from 'zod';

describe('agent-loop', () => {
  it('records model streaming lifecycle events when streamComplete succeeds', async () => {
    const registry = new ToolRegistry();
    const modelClient: ModelClient = {
      async complete(): Promise<ModelOutput> {
        throw new Error('complete should not be called');
      },
      async streamComplete(
        _input: ModelInput,
        callbacks: ModelStreamCallbacks = {}
      ): Promise<ModelOutput> {
        callbacks.onStart?.();
        callbacks.onDelta?.('{"type":"finish",');
        callbacks.onDelta?.('"message":"streamed"}');
        const output = {
          text: '{"type":"finish","message":"streamed"}'
        };
        callbacks.onFinish?.(output);
        return output;
      }
    };
    const loop = new AgentLoop({
      modelClient,
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: '观察页面',
      maxSteps: 1
    });

    expect(result.status).toBe('finished');
    expect(result.trace.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        TRACE_EVENT_NAMES.MODEL_STREAM_STARTED,
        TRACE_EVENT_NAMES.MODEL_STREAM_DELTA,
        TRACE_EVENT_NAMES.MODEL_STREAM_FINISHED
      ])
    );
  });

  it('falls back to complete when model streaming fails', async () => {
    const registry = new ToolRegistry();
    const modelClient: ModelClient = {
      async complete(): Promise<ModelOutput> {
        return {
          text: JSON.stringify({
            type: 'finish',
            message: 'fallback complete'
          })
        };
      },
      async streamComplete(
        _input: ModelInput,
        callbacks: ModelStreamCallbacks = {}
      ): Promise<ModelOutput> {
        callbacks.onStart?.();
        callbacks.onError?.(new Error('stream broke sk-live-super-secret-token'));
        throw new Error('stream broke sk-live-super-secret-token');
      }
    };
    const loop = new AgentLoop({
      modelClient,
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: '观察页面',
      maxSteps: 1
    });

    expect(result.status).toBe('finished');
    expect(result.message).toBe('fallback complete');
    expect(result.trace.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        TRACE_EVENT_NAMES.MODEL_STREAM_FAILED,
        TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_STARTED,
        TRACE_EVENT_NAMES.MODEL_STREAM_FALLBACK_FINISHED
      ])
    );
    expect(JSON.stringify(result.trace)).not.toContain('sk-live-super-secret-token');
  });

  it.each([
    ['ask', '观察页面'],
    ['debug', '检查 console 错误'],
    ['form', '诊断表单为什么不能提交'],
    ['act', '准备点击提交按钮']
  ] as const)('finishes %s mode with classification and plan traces', async (mode, task) => {
    const registry = new ToolRegistry();
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'finish',
          message: `${mode} done`
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task,
      mode,
      maxSteps: 1
    });

    expect(result.status).toBe('finished');
    expect(result.trace.some((event) => event.type === TRACE_EVENT_NAMES.TASK_CLASSIFIED))
      .toBe(true);
    expect(result.trace.some((event) => event.type === TRACE_EVENT_NAMES.PLAN_UPDATED))
      .toBe(true);
    if (mode === 'debug' || mode === 'form') {
      expect(
        result.trace.some((event) => event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED)
      ).toBe(true);
    }
  });

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
      locale: 'zh',
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
        code: ERROR_CODES.APPROVAL_REQUIRED,
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
      locale: 'zh',
      task: 'Run high risk action',
      maxSteps: 2
    });

    expect(result.status).toBe('waiting_for_approval');
    expect(
      result.trace.some((event) => event.type === TRACE_EVENT_NAMES.APPROVAL_REQUIRED)
    ).toBe(true);

    const turnFinished = result.trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.TURN_FINISHED
    );
    expect(turnFinished).toBeDefined();
    if (!turnFinished || turnFinished.type !== TRACE_EVENT_NAMES.TURN_FINISHED) {
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
      locale: 'zh',
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
    expect(runStarted.payload.metadata.providerBaseUrl).toBeUndefined();
  });

  it('records explicit run mode and only exposes mode-available tools to the model', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: TOOL_NAMES.PAGE_OBSERVE,
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
      locale: 'zh',
      task: 'Diagnose form',
      mode: 'form',
      maxSteps: 1
    });
    const runStarted = result.trace.find((event) => event.type === 'run_started');

    expect(systemPrompt).toContain('Current run mode: form');
    expect(systemPrompt).toContain(TOOL_NAMES.PAGE_OBSERVE);
    expect(systemPrompt).toContain('bh_form_read_fields');
    expect(systemPrompt).not.toContain('bh_debug_only');
    expect(runStarted).toBeDefined();
    if (!runStarted || runStarted.type !== 'run_started') {
      throw new Error('expected run_started event');
    }
    expect(runStarted.payload.metadata.runMode).toBe('form');
  });

  it('passes selected tool contracts and mode classification into context builder', async () => {
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
    registry.register({
      name: 'bh_mock_high_risk_ask',
      title: 'High Risk Ask',
      description: 'High risk ask tool',
      modes: ['ask'],
      risk: 'high',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'should not be selected'
      })
    });

    const contextBuilder = new ContextBuilder();
    let capturedToolNames: string[] | undefined;
    let capturedModeReason: string | undefined;
    const originalBuild = contextBuilder.build.bind(contextBuilder);
    contextBuilder.build = (input) => {
      capturedToolNames = input.tools?.map((tool) => tool.name);
      capturedModeReason = input.modeReason;
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
      locale: 'zh',
      task: 'Observe page',
      maxSteps: 1
    });

    expect(capturedToolNames).toEqual(['bh_mock_page_observe']);
    expect(capturedModeReason).toContain('先诊断');
  });

  it('blocks hidden tools before execution when runtime capability is unavailable', async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      name: 'bh_debug_unavailable',
      title: 'Unavailable Debug',
      description: 'Debug tool requiring shallow debug capability',
      modes: ['debug'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string()
      }),
      execute: async () => {
        executed = true;
        return {
          ok: true,
          code: 'OK',
          summary: 'should not execute'
        };
      }
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_debug_unavailable',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder(),
      runtimeCapabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: false,
        hasDownloadsPermission: false,
        hostPermissions: [],
        shallowDebugAvailable: false,
        cdp: 'reserved'
      }
    });

    const result = await loop.run({
      locale: 'zh',
      task: '检查页面错误',
      mode: 'debug',
      maxSteps: 1
    });

    expect(executed).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe(ERROR_CODES.TOOL_MODE_NOT_ALLOWED);
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
      locale: 'zh',
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
      locale: 'zh',
      task: 'Run tool',
      maxSteps: 2
    });
    const toolStarted = result.trace.find((event) => event.type === 'tool_started');
    const toolResult = result.trace.find((event) => event.type === 'tool_result');
    const approvalRequired = result.trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.APPROVAL_REQUIRED
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
    expect(toolResult.payload.result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
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
        code: ERROR_CODES.APPROVAL_REQUIRED,
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
      locale: 'zh',
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
      locale: 'zh',
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

  it('continues after a recoverable tool failure and records recovery action', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_stale_ref',
      title: 'Stale Ref',
      description: 'Returns a recoverable stale ref failure',
      modes: ['ask'],
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
        code: 'REF_STALE',
        summary: 'ref is stale',
        error: {
          message: 'ref is stale',
          detail: {
            retryable: true
          }
        },
        nextHints: ['重新观察页面后继续']
      })
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_stale_ref',
          args: {}
        }),
        JSON.stringify({
          type: 'finish',
          message: 'recovered'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: 'Recover stale ref',
      maxSteps: 3
    });
    const recoveryAction = result.trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.RECOVERY_ACTION
    );
    const recoveringTurn = result.trace.find(
      (event) =>
        event.type === TRACE_EVENT_NAMES.TURN_FINISHED &&
        event.payload.status === 'recovering'
    );
    const recoveryPlan = result.trace
      .filter((event) => event.type === TRACE_EVENT_NAMES.PLAN_UPDATED)
      .find(
        (event) =>
          event.type === TRACE_EVENT_NAMES.PLAN_UPDATED &&
          event.payload.plan.steps.some(
            (step) =>
              step.id === 'observe' &&
              step.status === 'current' &&
              step.evidence?.includes('REF_STALE')
          )
      );

    expect(result.status).toBe('finished');
    expect(result.message).toBe('recovered');
    expect(result.trace.some((event) => event.type === 'run_failed')).toBe(false);
    expect(recoveryAction).toBeDefined();
    if (!recoveryAction || recoveryAction.type !== TRACE_EVENT_NAMES.RECOVERY_ACTION) {
      throw new Error('expected recovery_action event');
    }
    expect(recoveryAction.payload.recovery.action.type).toBe('re_observe');
    expect(recoveringTurn).toBeDefined();
    expect(recoveryPlan).toBeDefined();
  });

  it('fails with a limitation when recovery budget is exhausted', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_mock_repeated_stale_ref',
      title: 'Repeated Stale Ref',
      description: 'Always returns a recoverable stale ref failure',
      modes: ['ask'],
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
        code: 'REF_STALE',
        summary: 'ref is still stale',
        error: {
          message: 'ref is still stale',
          detail: {
            retryable: true
          }
        },
        nextHints: ['重新观察页面后继续']
      })
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_repeated_stale_ref',
          args: {}
        }),
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_mock_repeated_stale_ref',
          args: {}
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: 'Recover stale ref twice',
      maxSteps: 3
    });
    const recoveryActions = result.trace.filter(
      (event) => event.type === TRACE_EVENT_NAMES.RECOVERY_ACTION
    );
    const lastRecovery = recoveryActions.at(-1);

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('REF_STALE');
    expect(recoveryActions).toHaveLength(2);
    expect(lastRecovery).toBeDefined();
    if (!lastRecovery || lastRecovery.type !== TRACE_EVENT_NAMES.RECOVERY_ACTION) {
      throw new Error('expected recovery_action event');
    }
    expect(lastRecovery.payload.recovery.action.type).toBe('fail');
    expect(lastRecovery.payload.recovery.limitation).toContain('exhausted');
  });

  it('emits Form Doctor findings and DebugReport before finishing form runs', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'bh_form_read_fields',
      title: 'Read Form Fields',
      description: 'Reads form fields',
      modes: ['form'],
      risk: 'safe',
      argsSchema: z.object({}),
      resultSchema: z.object({
        ok: z.boolean(),
        code: z.string(),
        summary: z.string(),
        data: z.unknown()
      }),
      execute: async () => ({
        ok: true,
        code: 'OK',
        summary: 'Read 1 fields',
        data: {
          status: 'ready',
          fields: [
            {
              refId: 'ref_email',
              label: 'Email',
              name: 'email',
              type: 'email',
              required: true,
              disabled: false,
              sensitive: false,
              valuePreview: 'empty',
              validation: {
                valid: false,
                message: '请填写邮箱',
                ariaInvalid: true
              },
              warnings: []
            }
          ],
          count: 1,
          submit: {
            disabled: true,
            reason: {
              kind: 'inferred',
              message: '必填字段为空',
              fieldRefId: 'ref_email'
            }
          },
          warnings: []
        }
      })
    });

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: 'bh_form_read_fields',
          args: {}
        }),
        JSON.stringify({
          type: 'finish',
          message: 'form report ready'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(registry),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: '诊断这个表单为什么不能提交',
      mode: 'form',
      maxSteps: 3
    });
    const findings = result.trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.FINDINGS_REPORTED
    );
    const report = result.trace.find(
      (event) => event.type === TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED
    );

    expect(result.status).toBe('finished');
    expect(findings).toBeDefined();
    expect(report).toBeDefined();
    if (!findings || findings.type !== TRACE_EVENT_NAMES.FINDINGS_REPORTED) {
      throw new Error('expected findings_reported event');
    }
    if (!report || report.type !== TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED) {
      throw new Error('expected debug_report_created event');
    }
    expect(findings.payload.findings.map((finding) => finding.title)).toContain(
      '必填字段为空'
    );
    expect(report.payload.report.title).toBe('Form Doctor 诊断报告');
  });

  it('pauses instead of finishing when explicit success criteria have no supporting evidence', async () => {
    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'finish',
          message: 'done'
        })
      ]),
      decisionParser: new DecisionParser(),
      toolRouter: new ToolRouter(new ToolRegistry()),
      contextBuilder: new ContextBuilder(),
      traceRecorder: new InMemoryTraceRecorder()
    });

    const result = await loop.run({
      locale: 'zh',
      task: '检查页面健康状态',
      mode: 'debug',
      successCriteria: ['读取页面健康摘要'],
      maxSteps: 1
    });

    expect(result.status).toBe('paused');
    expect(result.message).toContain('Success criteria not satisfied');
    expect(result.message).toContain('读取页面健康摘要');
  });

  it('treats bh_agent_finish tool_call as a finished run', async () => {
    const registry = new ToolRegistry();
    registry.register(bhAgentFinish);

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: TOOL_NAMES.AGENT_FINISH,
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
      locale: 'zh',
      task: 'Finish with internal tool',
      maxSteps: 2
    });

    expect(result.status).toBe('finished');
    expect(result.message).toBe('Finished through internal tool');
    expect(result.trace.some((event) => event.type === TRACE_EVENT_NAMES.RUN_FINISHED))
      .toBe(true);
  });

  it('treats bh_agent_ask_user tool_call as a paused run', async () => {
    const registry = new ToolRegistry();
    registry.register(bhAgentAskUser);

    const loop = new AgentLoop({
      modelClient: new MockModelClient([
        JSON.stringify({
          type: 'tool_call',
          tool: TOOL_NAMES.AGENT_ASK_USER,
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
      locale: 'zh',
      task: 'Ask user through internal tool',
      maxSteps: 2
    });

    expect(result.status).toBe('paused');
    expect(result.message).toBe('Need input?');
    expect(result.trace.some((event) => event.type === 'run_failed')).toBe(false);
  });
});
