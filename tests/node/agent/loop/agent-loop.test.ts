import { describe, expect, it, vi } from 'vitest';

import { AgentLoop } from '../../../../src/agent/loop/agent-loop';
import type { RunRecord } from '../../../../src/agent/loop/types';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { ExecuteToolInput, RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('AgentLoop', () => {
  it('auto-runs safe explicitly requested read-only tools when finish is blocked by missing tool evidence', async () => {
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      timestamp: 1,
      payload: {
        task: '第一步必须调用 bh_form_read_fields 读取字段，然后完成。',
        mode: 'form'
      }
    }, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      timestamp: 1,
      payload: {
        tool: TOOL_NAMES.PAGE_OBSERVE,
        ok: true,
        code: 'OK',
        summary: 'Observed form fields on the page.',
        changedPage: false,
        requiresObserve: false
      }
    }];
    const record: RunRecord & { tabId: number } = {
      task: '第一步必须调用 bh_form_read_fields 读取字段，然后完成。',
      mode: 'form',
      tabId: 1,
      trace
    };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'form',
      status: 'observed',
      refs: [],
      trace
    };
    const executeTool = vi.fn(async (input: ExecuteToolInput) => {
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        timestamp: 2,
        payload: {
          tool: input.tool,
          args: input.args
        }
      });
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        timestamp: 3,
        payload: {
          tool: input.tool,
          ok: true,
          code: 'OK',
          summary: 'Read fields',
          changedPage: false,
          requiresObserve: false
        }
      });
      return { ok: true };
    });
    const complete = vi
      .fn(async () => ({ text: '{"type":"finish","message":"字段读取完成。"}' }));
    const loop = new AgentLoop({
      settingsStore: {
        getProviderSettings: async () => ({
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          model: 'demo-model'
        }),
        setProviderSettings: async () => {}
      },
      createProviderModelClient: () => ({ complete }),
      getSnapshot: () => snapshot,
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      notifySnapshotUpdated: vi.fn(),
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      executeTool,
      withRunMessages: (value) => value,
      getToolContracts: () => []
    });

    const result = await loop.run({ runId: 'run_1', record, maxSteps: 3 });

    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_READ_FIELDS,
      args: {},
      source: 'runtime'
    });
    expect(result.status).toBe('finished');
  });

  it('auto-runs explicitly requested visible text read after viewport scroll before accepting finish', async () => {
    const task = '第二步直接调用 bh_viewport_scroll。第三步滚动后必须调用 bh_page_read_visible_text 读取当前视口附近内容。';
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      timestamp: 1,
      payload: {
        task,
        mode: 'ask'
      }
    }, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      timestamp: 2,
      payload: {
        tool: TOOL_NAMES.PAGE_READ_ARTICLE,
        ok: true,
        code: 'OK',
        summary: 'Read article about web accessibility and WCAG.',
        changedPage: false,
        requiresObserve: false
      }
    }, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      timestamp: 3,
      payload: {
        tool: TOOL_NAMES.VIEWPORT_SCROLL,
        ok: true,
        code: 'OK',
        summary: 'Scrolled viewport',
        changedPage: true,
        requiresObserve: true
      }
    }];
    const record: RunRecord & { tabId: number } = {
      task,
      mode: 'ask',
      tabId: 1,
      trace
    };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'observed',
      refs: [],
      trace
    };
    const executeTool = vi.fn(async (input: ExecuteToolInput) => {
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        timestamp: 4,
        payload: {
          tool: input.tool,
          args: input.args
        }
      });
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        timestamp: 5,
        payload: {
          tool: input.tool,
          ok: true,
          code: 'OK',
          summary: 'Visible text after scroll mentions accessibility standards and users.',
          changedPage: false,
          requiresObserve: false
        }
      });
      return { ok: true };
    });
    const complete = vi
      .fn(async () => ({ text: '{"type":"finish","message":"已基于文章和滚动后的可见文本总结 accessibility 内容。"}' }));
    const loop = new AgentLoop({
      settingsStore: {
        getProviderSettings: async () => ({
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          model: 'demo-model'
        }),
        setProviderSettings: async () => {}
      },
      createProviderModelClient: () => ({ complete }),
      getSnapshot: () => snapshot,
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      notifySnapshotUpdated: vi.fn(),
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      executeTool,
      withRunMessages: (value) => value,
      getToolContracts: () => []
    });

    const result = await loop.run({ runId: 'run_1', record, maxSteps: 3 });

    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
      args: {},
      source: 'runtime'
    });
    expect(result.status).toBe('finished');
  });

  it('auto-runs explicitly requested storage get with safe args parsed from the task', async () => {
    const task = '必须调用 bh_storage_list 读取 localStorage。然后调用 bh_storage_get 读取 sessionStorage 的 wizardStep。';
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      timestamp: 1,
      payload: {
        task,
        mode: 'full'
      }
    }, {
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      timestamp: 2,
      payload: {
        tool: TOOL_NAMES.STORAGE_LIST,
        ok: true,
        code: 'OK',
        summary: 'Listed 2 localStorage entries: authToken=[MASKED], theme=dark.',
        changedPage: false,
        requiresObserve: false
      }
    }];
    const record: RunRecord & { tabId: number } = {
      task,
      mode: 'full',
      tabId: 1,
      trace
    };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'full',
      status: 'observed',
      refs: [],
      trace
    };
    const executeTool = vi.fn(async (input: ExecuteToolInput) => {
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        timestamp: 3,
        payload: {
          tool: input.tool,
          args: input.args
        }
      });
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        timestamp: 4,
        payload: {
          tool: input.tool,
          ok: true,
          code: 'OK',
          summary: 'wizardStep=shipping',
          changedPage: false,
          requiresObserve: false
        }
      });
      return { ok: true };
    });
    const complete = vi
      .fn(async () => ({ text: '{"type":"finish","message":"localStorage 中 authToken 已脱敏，sessionStorage wizardStep=shipping。"}' }));
    const loop = new AgentLoop({
      settingsStore: {
        getProviderSettings: async () => ({
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          model: 'demo-model'
        }),
        setProviderSettings: async () => {}
      },
      createProviderModelClient: () => ({ complete }),
      getSnapshot: () => snapshot,
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      notifySnapshotUpdated: vi.fn(),
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      executeTool,
      withRunMessages: (value) => value,
      getToolContracts: () => [{
        name: TOOL_NAMES.STORAGE_LIST,
        title: '读取 Storage 列表',
        description: '读取 Web Storage key 和安全预览',
        modes: ['advanced'],
        risk: 'medium',
        argsSchema: {},
        readOnly: true,
        requiresApproval: false,
        contextVisibility: 'summary'
      }]
    });

    const result = await loop.run({ runId: 'run_1', record, maxSteps: 3 });

    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.STORAGE_GET,
      args: {
        area: 'sessionStorage',
        key: 'wizardStep'
      },
      source: 'runtime'
    });
    expect(result.status).toBe('finished');
  });

  it('auto-runs storage get after a model repeatedly lists storage instead of advancing', async () => {
    const task = '必须调用 bh_storage_list 读取 localStorage，limit=10。然后调用 bh_storage_get 读取 sessionStorage 的 wizardStep。';
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      timestamp: 1,
      payload: {
        task,
        mode: 'full'
      }
    }];
    const record: RunRecord & { tabId: number } = {
      task,
      mode: 'full',
      tabId: 1,
      trace
    };
    let snapshot: RunSnapshot = {
      runId: 'run_1',
      mode: 'full',
      status: 'observed',
      refs: [],
      trace
    };
    const executeTool = vi.fn(async (input: ExecuteToolInput) => {
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        timestamp: 2,
        payload: {
          tool: input.tool,
          args: input.args
        }
      });
      trace.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        timestamp: 3,
        payload: {
          tool: input.tool,
          ok: true,
          code: 'OK',
          summary: input.tool === TOOL_NAMES.STORAGE_GET
            ? 'wizardStep=shipping'
            : 'Listed localStorage entries: authToken=[MASKED], theme=dark.',
          changedPage: false,
          requiresObserve: false
        }
      });
      snapshot = {
        ...snapshot,
        toolResult: {
          tool: input.tool,
          ok: true,
          code: 'OK',
          summary: input.tool === TOOL_NAMES.STORAGE_GET
            ? 'wizardStep=shipping'
            : 'Listed localStorage entries: authToken=[MASKED], theme=dark.',
          changedPage: false,
          requiresObserve: false
        },
        trace
      };
      return { ok: true };
    });
    const complete = vi
      .fn()
      .mockResolvedValueOnce({
        text: '{"type":"tool_call","tool":"bh_storage_list","args":{"area":"localStorage","limit":10},"reason":"读取 localStorage","taskStateUpdate":{}}'
      })
      .mockResolvedValueOnce({
        text: '{"type":"finish","message":"localStorage 中 authToken 已脱敏，theme=dark；sessionStorage wizardStep=shipping。"}'
      });
    const loop = new AgentLoop({
      settingsStore: {
        getProviderSettings: async () => ({
          baseUrl: 'https://example.com/v1',
          apiKey: 'sk-test',
          model: 'demo-model'
        }),
        setProviderSettings: async () => {}
      },
      createProviderModelClient: () => ({ complete }),
      getSnapshot: () => snapshot,
      setSnapshot: (_runId, next) => {
        snapshot = next;
      },
      notifySnapshotUpdated: vi.fn(),
      appendTrace: (target, event) => {
        target.trace.push(event);
      },
      executeTool,
      withRunMessages: (value) => value,
      getToolContracts: () => [{
        name: TOOL_NAMES.STORAGE_LIST,
        title: '读取 Storage 列表',
        description: '读取 Web Storage key 和安全预览',
        modes: ['advanced'],
        risk: 'medium',
        argsSchema: {},
        readOnly: true,
        requiresApproval: false,
        contextVisibility: 'summary'
      }]
    });

    const result = await loop.run({ runId: 'run_1', record, maxSteps: 3 });

    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_1',
      tool: TOOL_NAMES.STORAGE_GET,
      args: {
        area: 'sessionStorage',
        key: 'wizardStep'
      },
      source: 'runtime'
    });
    expect(result.status).toBe('finished');
  });
});
