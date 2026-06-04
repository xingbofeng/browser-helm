import { describe, expect, it, vi } from 'vitest';
import { ToolExecutionService } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolExecutionDeps } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolRuntimeAdapter } from '../../../../../src/background/runtime/run/tools/adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../../src/shared/constants/tool-names';
import type { RunMode } from '../../../../../src/shared/schemas/tool.schema';
import type { ToolResult } from '../../../../../src/shared/schemas/tool-result.schema';

const noopAdapter: ToolRuntimeAdapter = {
  beforeExecution: () => [],
  afterExecution: () => [],
  afterApprovalRequested: () => []
};

const baseInput = { runId: 'run_1', tool: 'bh_test', args: {} };

function snapshotFromResult(tool: string, result: ToolResult) {
  return {
    tool,
    ok: result.ok,
    code: result.code,
    summary: result.summary
  };
}

function deps(overrides = {}) {
  return {
    getSnapshot: vi.fn().mockReturnValue({
      runId: 'run_1',
      mode: 'ask',
      status: 'observed' as const,
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: true,
        hasClipboardPermission: true,
        hasDownloadsPermission: true,
        hasStorageInspection: true,
        hostPermissions: ['http://127.0.0.1/*'],
        shallowDebugAvailable: true,
        cdp: 'available'
      }
    }),
    getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask' as RunMode, tabId: 42, trace: [] }),
    createToolRouter: vi.fn().mockReturnValue({ execute: vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false }), getToolContract: vi.fn().mockReturnValue(null) }),
    createContentRpcClient: vi.fn(),
    appendTrace: vi.fn(),
    setSnapshot: vi.fn(),
    setPendingAction: vi.fn(),
    snapshotToolResult: vi.fn().mockReturnValue({ tool: 'bh_test', ok: true, code: ERROR_CODES.OK, summary: 'ok' }),
    adapter: noopAdapter,
    toolPolicy: { evaluate: vi.fn().mockReturnValue({ allow: true, requiresApproval: false, reason: '', risk: 'low' }) },
    approvalManager: { create: vi.fn().mockReturnValue({ id: 'req_1' }) },
    approvalRequestForTrace: vi.fn().mockImplementation((r: unknown) => r),
    approvalRequiredResultFn: vi.fn().mockReturnValue({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      summary: 'approval needed',
      changedPage: false,
      requiresObserve: false,
      requiresApproval: true
    }),
    ...overrides
  };
}

describe('ToolExecutionService', () => {
  it('returns RUN_CANCELLED for cancelled run', async () => {
    const d = deps({ getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'ask', status: 'cancelled' as const }) });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ERROR_CODES.RUN_CANCELLED);
  });
  it('returns error for missing tab', async () => {
    const d = deps({ getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'ask', trace: [] }) });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
  });
  it('returns waiting_for_approval when policy blocks', async () => {
    const d = deps({
      toolPolicy: { evaluate: vi.fn().mockReturnValue({ allow: false, requiresApproval: true, reason: 'high risk', risk: 'high' }) },
      createToolRouter: vi.fn().mockReturnValue({ execute: vi.fn(), getToolContract: vi.fn().mockReturnValue({ risk: 'high', title: 'Test Tool' }) })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
  });
  it('uses authorization service before executing a contracted tool', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    });
    const d = deps({
      authorizationService: {
        authorize: vi.fn().mockReturnValue({
          allow: false,
          requiresApproval: true,
          reason: 'central authorization required approval',
          risk: 'medium',
          actionPreview: 'Test Tool (bh_test)'
        })
      },
      toolPolicy: { evaluate: vi.fn().mockReturnValue({ allow: true, requiresApproval: false, reason: '', risk: 'medium' }) },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: 'bh_test',
          title: 'Test Tool',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires approval before executing user-triggered CDP attach', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'debugger attached',
      changedPage: false,
      requiresObserve: false
    });
    const approvalCoordinator = {
      createRequest: vi.fn().mockReturnValue({
        request: {
          id: 'cdp_attach_req_1',
          runId: 'run_1',
          stepId: `run_1:${TOOL_NAMES.CDP_ATTACH}`,
          tool: TOOL_NAMES.CDP_ATTACH,
          argsPreview: {},
          risk: 'medium',
          reason: 'Tool metadata requires approval before execution',
          status: 'pending',
          createdAt: 1
        }
      })
    };
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'debug',
        status: 'observed' as const,
        capabilities: {
          hasActiveTab: true,
          hasDebuggerPermission: true,
          hasClipboardPermission: true,
          hasDownloadsPermission: true,
          hasStorageInspection: true,
          hostPermissions: ['http://127.0.0.1/*'],
          shallowDebugAvailable: true,
          cdp: 'available'
        }
      }),
      getRecord: vi.fn().mockReturnValue({ task: '连接 CDP debugger', mode: 'debug' as RunMode, tabId: 42, trace: [] }),
      approvalCoordinator,
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.CDP_ATTACH,
          title: 'CDP Attach',
          risk: 'medium',
          readOnly: false,
          requiresApproval: true
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.CDP_ATTACH,
      args: {},
      source: 'user'
    });

    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(approvalCoordinator.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      tool: TOOL_NAMES.CDP_ATTACH,
      pendingAction: {
        runId: 'run_1',
        tool: TOOL_NAMES.CDP_ATTACH,
        args: {},
        source: 'user'
      }
    }));
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires capability-bound tools even when snapshot capabilities are missing', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    });
    const authorize = vi.fn().mockReturnValue({
      allow: false,
      requiresApproval: false,
      code: ERROR_CODES.CAPABILITY_UNAVAILABLE,
      reason: 'Debugger capability unavailable',
      risk: 'medium'
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'debug', status: 'observed' as const }),
      getRecord: vi.fn().mockReturnValue({ task: '检查 console', mode: 'debug' as RunMode, tabId: 42, trace: [] }),
      authorizationService: { authorize },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
          title: 'Get Console Events',
          risk: 'medium',
          readOnly: true,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.CDP_GET_CONSOLE_EVENTS,
      args: {}
    });

    expect(result.code).toBe(ERROR_CODES.CAPABILITY_UNAVAILABLE);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      requiredCapability: 'debugger'
    }));
    expect(execute).not.toHaveBeenCalled();
  });
  it('creates approval requests through the approval coordinator transaction', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    });
    const input = { ...baseInput, tool: TOOL_NAMES.ACTION_CLICK, args: { refId: 'ref_1' } };
    const approvalManager = { create: vi.fn() };
    const setPendingAction = vi.fn();
    const approvalCoordinator = {
      createRequest: vi.fn().mockReturnValue({
        request: {
          id: 'coordinator_req_1',
          runId: 'run_1',
          stepId: 'run_1:bh_action_click',
          tool: TOOL_NAMES.ACTION_CLICK,
          argsPreview: { refId: 'ref_1' },
          risk: 'medium',
          reason: 'central authorization required approval',
          status: 'pending',
          createdAt: 1
        }
      })
    };
    const d = deps({
      approvalManager,
      setPendingAction,
      approvalCoordinator,
      authorizationService: {
        authorize: vi.fn().mockReturnValue({
          allow: false,
          requiresApproval: true,
          reason: 'central authorization required approval',
          risk: 'medium',
          actionPreview: 'Click Action (bh_action_click)'
        })
      },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.ACTION_CLICK,
          title: 'Click Action',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute(input);

    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(approvalCoordinator.createRequest).toHaveBeenCalledWith(expect.objectContaining({
      runId: 'run_1',
      stepId: 'run_1:bh_action_click',
      tool: TOOL_NAMES.ACTION_CLICK,
      pendingAction: input
    }));
    expect(approvalManager.create).not.toHaveBeenCalled();
    expect(setPendingAction).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it('creates clipboard and storage approval previews without raw sensitive values', async () => {
    const clipboardExecute = vi.fn().mockResolvedValue({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      summary: 'Clipboard write requires approval',
      changedPage: false,
      requiresObserve: false,
      requiresApproval: true,
      approval: {
        reason: 'Clipboard write requires explicit user approval.',
        risk: 'high',
        actionPreview: 'Write 21 characters to clipboard'
      }
    });
    const storageExecute = vi.fn().mockResolvedValue({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      summary: 'Storage set requires approval',
      changedPage: false,
      requiresObserve: false,
      requiresApproval: true,
      approval: {
        reason: 'Changing localStorage.authToken requires explicit user approval.',
        risk: 'high',
        actionPreview: 'Set localStorage.authToken (23 characters)'
      }
    });
    const approvalCoordinator = {
      createRequest: vi.fn()
        .mockReturnValueOnce({
          request: {
            id: 'clipboard_req_1',
            runId: 'run_1',
            stepId: `run_1:${TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL}`,
            tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
            argsPreview: {},
            risk: 'high',
            reason: 'Clipboard write requires explicit user approval.',
            actionPreview: 'Write 21 characters to clipboard',
            status: 'pending',
            createdAt: 1
          }
        })
        .mockReturnValueOnce({
          request: {
            id: 'storage_req_1',
            runId: 'run_1',
            stepId: `run_1:${TOOL_NAMES.STORAGE_SET_WITH_APPROVAL}`,
            tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
            argsPreview: {},
            risk: 'high',
            reason: 'Changing localStorage.authToken requires explicit user approval.',
            actionPreview: 'Set localStorage.authToken (23 characters)',
            status: 'pending',
            createdAt: 1
          }
        })
    };
    const createToolRouter = vi.fn()
      .mockReturnValueOnce({
        execute: clipboardExecute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
          title: 'Write Clipboard With Approval',
          risk: 'high',
          readOnly: false,
          requiresApproval: true
        })
      })
      .mockReturnValueOnce({
        execute: storageExecute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
          title: 'Set Web Storage With Approval',
          risk: 'high',
          readOnly: false,
          requiresApproval: true
        })
      });
    const d = deps({
      approvalCoordinator,
      createToolRouter,
      adapter: {
        ...noopAdapter,
        shouldBypassPolicyApproval: (tool: string) =>
          tool === TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL ||
          tool === TOOL_NAMES.STORAGE_SET_WITH_APPROVAL
      }
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL,
      args: { text: 'copy private password' }
    });
    await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
      args: { area: 'localStorage', key: 'authToken', value: 'storage private password' }
    });

    type ApprovalCreateRequestForTest = {
      argsPreview: unknown;
      actionPreview?: string | undefined;
      reason: string;
    };
    const visibleRequests = approvalCoordinator.createRequest.mock.calls.map(([request]) => {
      const visibleRequest = request as ApprovalCreateRequestForTest;
      return {
        argsPreview: visibleRequest.argsPreview,
        actionPreview: visibleRequest.actionPreview,
        reason: visibleRequest.reason
      };
    });
    expect(JSON.stringify(visibleRequests)).not.toContain('copy private password');
    expect(JSON.stringify(visibleRequests)).not.toContain('storage private password');
    expect(approvalCoordinator.createRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      argsPreview: {
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'redacted'
        }
      },
      actionPreview: 'Write 21 characters to clipboard'
    }));
    expect(approvalCoordinator.createRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      argsPreview: {
        area: 'localStorage',
        key: 'authToken',
        valuePreview: {
          masked: true,
          preview: '[MASKED]',
          reason: 'redacted'
        }
      },
      actionPreview: 'Set localStorage.authToken (23 characters)'
    }));
    expect(clipboardExecute).toHaveBeenCalledTimes(1);
    expect(storageExecute).toHaveBeenCalledTimes(1);
  });
  it('returns waiting_for_user when authorization blocks without approval', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    });
    const setSnapshot = vi.fn();
    const d = deps({
      setSnapshot,
      authorizationService: {
        authorize: vi.fn().mockReturnValue({
          allow: false,
          requiresApproval: false,
          code: ERROR_CODES.USER_INTENT_MISMATCH,
          reason: 'Target is not grounded in the user task',
          risk: 'medium'
        })
      },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: 'bh_test',
          title: 'Test Tool',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_INTENT_MISMATCH,
      summary: 'Target is not grounded in the user task',
      changedPage: false,
      requiresObserve: false
    });
    expect(execute).not.toHaveBeenCalled();
    expect(setSnapshot).toHaveBeenCalledWith(
      'run_1',
      expect.objectContaining({
        status: 'waiting_for_user'
      })
    );
  });
  it('uses execution-layer domain consent for mutating tools', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'form',
        status: 'observed' as const,
        observation: { currentDomain: 'docs.example.com' }
      }),
      getRecord: vi.fn().mockReturnValue({ task: '填写表单', mode: 'form' as RunMode, tabId: 42, trace: [] }),
      getDomainPolicy: vi.fn().mockReturnValue({ defaultEnabled: false, enabledDomains: [] }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.FORM_FILL_MANY,
          title: 'Batch Fill Many Fields',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {}
    });
    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.DOMAIN_CONSENT_REQUIRED
    });
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires approval before executing public click actions', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'ok',
      changedPage: true,
      requiresObserve: true
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'act',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' }
      }),
      getRecord: vi.fn().mockReturnValue({ task: 'Click Continue', mode: 'act' as RunMode, tabId: 42, trace: [] }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.ACTION_CLICK,
          title: 'Click Action',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.ACTION_CLICK,
      args: { refId: 'ref_1' },
      source: 'agent'
    });
    expect(result.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(execute).not.toHaveBeenCalled();
  });
  it('executes public click actions when the target name is explicit in the user task', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'clicked',
      changedPage: true,
      requiresObserve: true
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'act',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' },
        refs: [
          {
            refId: 'ref_1',
            role: 'button',
            name: '展开详情',
            tagName: 'BUTTON',
            visible: true
          }
        ]
      }),
      getRecord: vi.fn().mockReturnValue({ task: '点击展开详情按钮', mode: 'act' as RunMode, tabId: 42, trace: [] }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.ACTION_CLICK,
          title: 'Click Action',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.ACTION_CLICK,
      args: { refId: 'ref_1' },
      source: 'agent'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: true,
      requiresObserve: true
    });
    expect(execute).toHaveBeenCalled();
  });

  it('requires approval for public user-sourced first click actions', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'clicked',
      changedPage: true,
      requiresObserve: true
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'act',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' },
        refs: [
          {
            refId: 'ref_1',
            role: 'button',
            name: '继续',
            tagName: 'BUTTON',
            visible: true
          }
        ]
      }),
      getRecord: vi.fn().mockReturnValue({
        task: '总结这个页面，不要点击按钮。',
        mode: 'act' as RunMode,
        tabId: 42,
        trace: []
      }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.ACTION_CLICK,
          title: 'Click Action',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.ACTION_CLICK,
      args: { refId: 'ref_1' },
      source: 'user'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks direct form fill when the value is not explicit in the user task', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'filled',
      changedPage: true,
      requiresObserve: false
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'form',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' }
      }),
      getRecord: vi.fn().mockReturnValue({
        task: 'Fill the name field with John.',
        mode: 'form' as RunMode,
        tabId: 42,
        trace: []
      }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.FORM_FILL_FIELD,
          title: 'Fill Single Field',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: { fieldRefId: 'field_1', value: 'Mallory' },
      source: 'agent'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_INTENT_MISMATCH,
      changedPage: false,
      requiresObserve: false
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('blocks public user-sourced form fill when the value is not explicit in the user task', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'filled',
      changedPage: true,
      requiresObserve: true
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'form',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' }
      }),
      getRecord: vi.fn().mockReturnValue({
        task: '总结这个页面，不要填写表单。',
        mode: 'form' as RunMode,
        tabId: 42,
        trace: []
      }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.FORM_FILL_FIELD,
          title: 'Fill Field',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: { fieldRefId: 'email', value: 'attacker@example.com' },
      source: 'user'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.USER_INTENT_MISMATCH
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows direct form fill when every value is explicit in the user task', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'filled',
      changedPage: true,
      requiresObserve: false
    });
    const d = deps({
      getSnapshot: vi.fn().mockReturnValue({
        runId: 'run_1',
        mode: 'form',
        status: 'observed' as const,
        observation: { currentDomain: 'localhost' }
      }),
      getRecord: vi.fn().mockReturnValue({
        task: 'Fill the name field with John.',
        mode: 'form' as RunMode,
        tabId: 42,
        trace: []
      }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          name: TOOL_NAMES.FORM_FILL_FIELD,
          title: 'Fill Single Field',
          risk: 'medium',
          readOnly: false,
          requiresApproval: false
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: { fieldRefId: 'field_1', value: 'John' },
      source: 'agent'
    });

    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalled();
  });
  it('passes full mode into policy before executing high-risk tools', async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false });
    const evaluate = vi.fn().mockReturnValue({ allow: true, requiresApproval: false, reason: '', risk: 'high' });
    const d = deps({
      getRecord: vi.fn().mockReturnValue({ task: 'test', mode: 'full' as RunMode, tabId: 42, trace: [] }),
      toolPolicy: { evaluate },
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({ risk: 'high', title: 'Test Tool' })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(evaluate).toHaveBeenCalledWith('high', 'full');
    expect(execute).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });
  it('returns waiting_for_approval when result.requiresApproval', async () => {
    const d = deps();
    d.createToolRouter = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ ok: true, code: ERROR_CODES.OK, summary: 'ok', changedPage: false, requiresObserve: false, requiresApproval: true, approval: { risk: 'high', reason: 'needs approval' } }),
      getToolContract: vi.fn().mockReturnValue(null)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.requiresApproval).toBe(true);
  });
  it('returns success', async () => {
    const d = deps();
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(true);
  });
  it('injects a vision client into the tool context when available', async () => {
    const visionClient = { describeViewport: vi.fn() };
    const execute = vi.fn().mockResolvedValue({
      ok: true,
      code: ERROR_CODES.OK,
      summary: 'vision ok',
      changedPage: false,
      requiresObserve: false
    });
    const d = deps({
      createVisionClient: vi.fn().mockResolvedValue(visionClient),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({ ...baseInput, tool: 'bh_vision_describe_viewport' });
    expect(result.ok).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      { tool: 'bh_vision_describe_viewport', args: {} },
      expect.objectContaining({ visionClient })
    );
  });
  it('returns error on failure', async () => {
    const d = deps();
    d.createToolRouter = vi.fn().mockReturnValue({
      execute: vi.fn().mockResolvedValue({ ok: false, code: 'ERR', summary: 'fail', changedPage: false, requiresObserve: false }),
      getToolContract: vi.fn().mockReturnValue(null)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute(baseInput);
    expect(result.ok).toBe(false);
  });
  it('keeps the run observed when vision is unavailable but DOM/a11y fallback is available', async () => {
    const setSnapshot = vi.fn();
    const d = deps({
      setSnapshot,
      createToolRouter: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue({
          ok: false,
          code: ERROR_CODES.VISION_UNAVAILABLE,
          summary: 'Vision unavailable; falling back to DOM/a11y observation.',
          changedPage: false,
          requiresObserve: false,
          data: { observation: { fallback: 'dom_a11y' } }
        }),
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    const result = await svc.execute({ ...baseInput, tool: 'bh_vision_describe_viewport' });
    expect(result.code).toBe(ERROR_CODES.VISION_UNAVAILABLE);
    expect(setSnapshot).toHaveBeenLastCalledWith('run_1', expect.objectContaining({
      status: 'observed'
    }));
    expect(setSnapshot.mock.calls.at(-1)?.[1]).not.toHaveProperty('error');
  });
  it('runs recovery re-observe for stale ref failures', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: 'REF_STALE',
        summary: 'ref is stale',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [],
          warnings: []
        }
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute(baseInput);

    expect(result.ok).toBe(false);
    expect(execute).toHaveBeenLastCalledWith(
      { tool: 'bh_page_observe', args: {} },
      expect.objectContaining({ stepId: 'run_1:recovery_observe' })
    );
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[0]).toBe('run_1');
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: {
        action: { type: 're_observe' }
      }
    });
  });
  it('records recovery and retries once with deterministically repaired tool args', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.TOOL_ARGS_INVALID,
        summary: 'invalid args',
        changedPage: false,
        requiresObserve: false
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'retried with repaired args',
        changedPage: false,
        requiresObserve: false
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          risk: 'safe',
          title: 'Test Tool',
          argsSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' },
              enabled: { type: 'boolean' }
            }
          }
        })
      }),
      snapshotToolResult: vi.fn().mockImplementation(snapshotFromResult)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    const result = await svc.execute({
      ...baseInput,
      args: { count: '3', enabled: 'true' }
    });

    expect(result.ok).toBe(false);
    expect(execute).toHaveBeenNthCalledWith(
      2,
      { tool: 'bh_test', args: { count: 3, enabled: true } },
      expect.objectContaining({ stepId: 'run_1:bh_test:recovery_retry' })
    );
    const recoveryEvent = vi.mocked(d.appendTrace).mock.calls
      .map((call) => call[1] as { type?: string; payload?: unknown })
      .find((event) => event.type === 'recovery_action');
    expect(recoveryEvent).toMatchObject({
      type: 'recovery_action',
      payload: {
        recovery: {
          action: { type: 'repair_tool_args', reason: ERROR_CODES.TOOL_ARGS_INVALID }
        }
      }
    });
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } }; toolResult?: { ok?: boolean } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: { action: { type: 'repair_tool_args' } },
      toolResult: { ok: true }
    });
  });
  it('waits for user input when invalid tool args cannot be repaired deterministically', async () => {
    const execute = vi.fn().mockResolvedValue({
      ok: false,
      code: ERROR_CODES.TOOL_ARGS_INVALID,
      summary: 'missing required args',
      changedPage: false,
      requiresObserve: false
    });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue({
          risk: 'safe',
          title: 'Test Tool',
          argsSchema: {
            type: 'object',
            properties: {
              count: { type: 'integer' }
            }
          }
        })
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: {}
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; canReviseGoal?: boolean; recovery?: { limitation?: string } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'waiting_for_user',
      canReviseGoal: true,
      recovery: {
        limitation: 'Tool arguments could not be repaired deterministically'
      }
    });
  });
  it('re-observes and retries with a deterministic alternative ref candidate', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_FOUND,
        summary: 'old ref missing',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [
            { refId: 'old', role: 'button', name: 'Submit', tagName: 'button', visible: false },
            { refId: 'new', role: 'button', name: 'Submit', tagName: 'button', visible: true }
          ],
          warnings: []
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'retried with new ref',
        changedPage: false,
        requiresObserve: false
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      }),
      snapshotToolResult: vi.fn().mockImplementation(snapshotFromResult)
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: { refId: 'old', role: 'button', name: 'Submit' }
    });

    expect(execute).toHaveBeenNthCalledWith(
      3,
      { tool: 'bh_test', args: { refId: 'new', role: 'button', name: 'Submit' } },
      expect.objectContaining({ stepId: 'run_1:bh_test:recovery_retry' })
    );
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; recovery?: { action?: { type?: string } }; toolResult?: { ok?: boolean } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'observed',
      recovery: { action: { type: 'find_alternative_ref' } },
      toolResult: { ok: true }
    });
  });
  it('waits for user input when no deterministic alternative ref candidate is found', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_FOUND,
        summary: 'old ref missing',
        changedPage: false,
        requiresObserve: true
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'observed again',
        changedPage: false,
        requiresObserve: false,
        data: {
          url: 'https://example.com',
          title: 'Example',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: '',
          pageStateSummary: '',
          refSummary: [
            { refId: 'other', role: 'link', name: 'Help', tagName: 'a', visible: true }
          ],
          warnings: []
        }
      });
    const d = deps({
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      ...baseInput,
      args: { refId: 'old', role: 'button', name: 'Submit' }
    });

    expect(execute).toHaveBeenCalledTimes(2);
    const lastSetSnapshotCall = vi.mocked(d.setSnapshot).mock.calls.at(-1) as unknown as [
      string,
      { status?: string; canReviseGoal?: boolean; recovery?: { limitation?: string } }
    ] | undefined;
    expect(lastSetSnapshotCall?.[1]).toMatchObject({
      status: 'waiting_for_user',
      canReviseGoal: true,
      recovery: {
        limitation: 'No deterministic alternative ref candidate found'
      }
    });
  });
  it('writes adapter events to trace', async () => {
    const adapterWithEvents: ToolRuntimeAdapter = {
      beforeExecution: () => [{ runId: 'run_1', type: 'test_before' }],
      afterExecution: () => [{ runId: 'run_1', type: 'test_after' }],
      afterApprovalRequested: () => []
    };
    const d = deps({ adapter: adapterWithEvents });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);
    await svc.execute(baseInput);
    expect(d.appendTrace).toHaveBeenCalled();
  });
  it('runs read-only form verification after successful form fill', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'filled',
        changedPage: true,
        requiresObserve: false
      })
      .mockResolvedValueOnce({
        ok: true,
        code: ERROR_CODES.OK,
        summary: 'Form verification passed',
        changedPage: false,
        requiresObserve: false,
        data: {
          status: 'pass',
          allValid: true,
          missingRequired: [],
          invalidFields: [],
          fieldResults: []
        }
      });
    const d = deps({
      getRecord: vi.fn().mockReturnValue({ task: '填写后必须调用 bh_form_verify 复查', mode: 'form' as RunMode, tabId: 42, trace: [] }),
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const svc = new ToolExecutionService(d as unknown as ToolExecutionDeps);

    await svc.execute({
      runId: 'run_1',
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [
          { fieldRefId: 'ref_1', value: 'Ada' },
          { fieldRefId: 'ref_2', value: 'true' }
        ]
      }
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenNthCalledWith(
      2,
      {
        tool: TOOL_NAMES.FORM_VERIFY,
        args: {
          fieldRefIds: ['ref_1', 'ref_2']
        }
      },
      expect.objectContaining({
        stepId: `run_1:${TOOL_NAMES.FORM_VERIFY}:post_fill`
      })
    );
  });
  it('does not parse form tool result shapes', async () => {
    const source = await import('../../../../../src/background/runtime/run/tools/tool-execution-service');
    const code = source.ToolExecutionService.toString();
    expect(code).not.toContain('FORM_INFER_FILL_PLAN');
  });
});
