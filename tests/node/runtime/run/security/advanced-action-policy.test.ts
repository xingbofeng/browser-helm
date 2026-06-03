import { describe, expect, it, vi } from 'vitest';

import { AuthorizationService } from '../../../../../src/background/runtime/run/security/authorization-service';
import type {
  RuntimeToolPolicyLike,
  ToolAuthorizationContext
} from '../../../../../src/background/runtime/run/security/action-context';
import { ToolExecutionService } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolExecutionDeps } from '../../../../../src/background/runtime/run/tools/tool-execution-service';
import type { ToolRuntimeAdapter } from '../../../../../src/background/runtime/run/tools/adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';
import { INTERNAL_TOOL_NAMES } from '../../../../../src/shared/constants/internal-tool-names';
import type { RunMode } from '../../../../../src/shared/schemas/tool.schema';
import type { ToolResult } from '../../../../../src/shared/schemas/tool-result.schema';

type ApprovalRequiredInput = Parameters<ToolExecutionDeps['approvalRequiredResultFn']>[0];

const noopAdapter: ToolRuntimeAdapter = {
  beforeExecution: () => [],
  afterExecution: () => [],
  afterApprovalRequested: () => []
};

const baseContext: ToolAuthorizationContext = {
  runId: 'run_1',
  tool: 'bh_action_click',
  title: 'Click Action',
  argsPreview: {},
  runMode: 'act',
  risk: 'medium',
  readOnly: false,
  requiresApproval: false,
  changedPageExpected: true,
  source: 'agent',
  userTask: '点击支付按钮',
  pageDomain: 'shop.example'
};

describe('advanced action policy', () => {
  it('includes origin, frame, and ref context in approval previews', () => {
    const service = new AuthorizationService(policy({
      allow: false,
      requiresApproval: true,
      reason: 'approval required',
      risk: 'medium'
    }));

    const decision = service.authorize({
      ...baseContext,
      targetSummary: '支付',
      argsPreview: {
        refId: 'frame_7:ref_pay',
        frameId: 7,
        origin: 'https://shop.example',
        pageOrigin: 'https://shop.example',
        crossOrigin: false
      }
    });

    expect(decision).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'approval required'
    });
    expect(decision.requiresApproval ? decision.actionPreview : '').toContain('frame=7');
    expect(decision.requiresApproval ? decision.actionPreview : '').toContain('ref=frame_7:ref_pay');
    expect(decision.requiresApproval ? decision.actionPreview : '').toContain('origin=https://shop.example');
    expect(decision.requiresApproval ? decision.actionPreview : '').toContain('target=支付');
  });

  it('requires approval for cross-origin iframe mutations even when user intent is explicit', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    const decision = service.authorize({
      ...baseContext,
      targetSummary: '支付',
      userTask: '点击支付按钮',
      userIntent: {
        required: true,
        grounded: true,
        reason: 'Click target is explicit in the user task'
      },
      argsPreview: {
        refId: 'frame_7:ref_pay',
        frameId: 7,
        origin: 'https://pay.example',
        pageOrigin: 'https://shop.example',
        crossOrigin: true
      }
    });

    expect(decision).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'Cross-origin iframe mutation requires approval before execution',
      risk: 'medium'
    });
  });

  it('approval-gates hidden internal iframe mutation tools with frame context', async () => {
    const execute = vi.fn();
    const approvalRequiredResultFn = vi.fn((input: ApprovalRequiredInput): ToolResult => ({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      summary: input.reason,
      changedPage: false,
      requiresObserve: false,
      requiresApproval: true,
      approval: {
        risk: input.risk,
        reason: input.reason,
        actionPreview: input.actionPreview
      }
    }));
    const approvalCoordinator = {
      createRequest: vi.fn().mockImplementation((request: { argsPreview: unknown; actionPreview?: string }) => ({
        request: {
          id: 'req_1',
          runId: 'run_1',
          stepId: 'run_1:bh_iframe_click',
          tool: INTERNAL_TOOL_NAMES.IFRAME_CLICK,
          argsPreview: request.argsPreview,
          risk: 'high',
          reason: 'approval required',
          actionPreview: request.actionPreview,
          status: 'pending',
          createdAt: 1
        }
      }))
    };
    const deps = executionDeps({
      approvalCoordinator,
      approvalRequiredResultFn,
      createToolRouter: vi.fn().mockReturnValue({
        execute,
        getToolContract: vi.fn().mockReturnValue(null)
      })
    });
    const service = new ToolExecutionService(deps as unknown as ToolExecutionDeps);

    const result = await service.execute({
      runId: 'run_1',
      tool: INTERNAL_TOOL_NAMES.IFRAME_CLICK,
      args: {
        frameId: 7,
        refId: 'ref_pay',
        origin: 'https://pay.example',
        pageOrigin: 'https://shop.example',
        crossOrigin: true
      },
      source: 'agent'
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true
    });
    expect(execute).not.toHaveBeenCalled();
    const preview = approvalRequiredResultFn.mock.calls[0]?.[0].actionPreview ?? '';
    expect(preview).toContain('frame=7');
    expect(preview).toContain('ref=ref_pay');
    expect(preview).toContain('origin=https://pay.example');
  });
});

function policy(result: ReturnType<RuntimeToolPolicyLike['evaluate']>): RuntimeToolPolicyLike {
  return {
    evaluate: vi.fn().mockReturnValue(result)
  };
}

function executionDeps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    getSnapshot: vi.fn().mockReturnValue({ runId: 'run_1', mode: 'act', status: 'observed' as const }),
    getRecord: vi.fn().mockReturnValue({
      task: '点击支付按钮',
      mode: 'act' as RunMode,
      tabId: 42,
      trace: []
    }),
    appendTrace: vi.fn(),
    createToolRouter: vi.fn(),
    createContentRpcClient: vi.fn(),
    setSnapshot: vi.fn(),
    setPendingAction: vi.fn(),
    snapshotToolResult: vi.fn().mockImplementation((tool: string, result: ToolResult) => ({
      tool,
      ok: result.ok,
      code: result.code,
      summary: result.summary
    })),
    adapter: noopAdapter,
    toolPolicy: policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }),
    approvalManager: { create: vi.fn() },
    approvalRequestForTrace: vi.fn().mockImplementation((request: unknown) => request),
    approvalRequiredResultFn: vi.fn(),
    ...overrides
  };
}
