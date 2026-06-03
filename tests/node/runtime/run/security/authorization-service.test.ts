import { describe, expect, it, vi } from 'vitest';

import { AuthorizationService } from '../../../../../src/background/runtime/run/security/authorization-service';
import type { RuntimeToolPolicyLike, ToolAuthorizationContext } from '../../../../../src/background/runtime/run/security/action-context';
import { ERROR_CODES } from '../../../../../src/shared/constants/error-codes';

const baseContext: ToolAuthorizationContext = {
  runId: 'run_1',
  tool: 'bh_test_tool',
  title: 'Test Tool',
  argsPreview: {},
  runMode: 'full',
  risk: 'high',
  readOnly: false,
  requiresApproval: false,
  userTask: 'test task'
};

function policy(result: ReturnType<RuntimeToolPolicyLike['evaluate']>): RuntimeToolPolicyLike {
  return {
    evaluate: vi.fn().mockReturnValue(result)
  };
}

describe('AuthorizationService', () => {
  it('keeps high-risk tools approval-gated in full mode', () => {
    const service = new AuthorizationService(policy({
      allow: false,
      requiresApproval: true,
      reason: 'approval required',
      risk: 'high'
    }));

    expect(service.authorize(baseContext)).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'approval required',
      risk: 'high',
      actionPreview: 'Test Tool (bh_test_tool)'
    });
  });

  it('treats tool metadata requiresApproval as an execution-layer block', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      risk: 'medium',
      requiresApproval: true
    })).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'Tool metadata requires approval before execution',
      risk: 'medium'
    });
  });

  it('allows safe read-only tools when policy allows them', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'safe'
    }));

    expect(service.authorize({
      ...baseContext,
      risk: 'safe',
      readOnly: true,
      requiresApproval: false
    })).toMatchObject({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'safe'
    });
  });

  it('blocks domain-gated operations when the current domain is not enabled', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      risk: 'medium',
      pageDomain: 'docs.example.com',
      domainOperation: 'form_fill',
      domainPolicy: {
        defaultEnabled: false,
        enabledDomains: []
      }
    })).toMatchObject({
      allow: false,
      requiresApproval: false,
      code: ERROR_CODES.DOMAIN_CONSENT_REQUIRED,
      reason: 'Domain docs.example.com requires explicit consent before running bh_test_tool'
    });
  });

  it('blocks tools when their required runtime capability is unavailable', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      risk: 'medium',
      requiredCapability: 'debugger',
      capabilities: {
        hasActiveTab: true,
        hasDebuggerPermission: false,
        hasClipboardPermission: true,
        hasDownloadsPermission: true,
        hostPermissions: [],
        shallowDebugAvailable: true,
        cdp: 'reserved'
      }
    })).toMatchObject({
      allow: false,
      requiresApproval: false,
      code: ERROR_CODES.CAPABILITY_UNAVAILABLE,
      reason: 'Debugger permission is unavailable for bh_test_tool'
    });
  });

  it('blocks agent-sourced page mutations when the target is not grounded in the user task', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      tool: 'bh_action_click',
      title: 'Click Action',
      risk: 'medium',
      changedPageExpected: true,
      source: 'agent',
      userTask: 'Summarize this page without clicking anything.',
      targetSummary: 'Continue subscription',
      userIntent: {
        required: true,
        grounded: false,
        reason: 'Target text is not present in the user task'
      }
    })).toMatchObject({
      allow: false,
      requiresApproval: false,
      code: ERROR_CODES.USER_INTENT_MISMATCH,
      reason: 'Target text is not present in the user task'
    });
  });

  it('requires approval for the first grounded page mutation', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      tool: 'bh_action_click',
      title: 'Click Action',
      risk: 'medium',
      changedPageExpected: true,
      source: 'agent',
      userTask: 'Click Continue.',
      targetSummary: 'Continue',
      userIntent: {
        required: true,
        grounded: true,
        reason: 'Target is explicitly mentioned by the user'
      },
      firstMutationRequiresApproval: true
    })).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'First page-mutating action requires approval before execution',
      risk: 'medium'
    });
  });

  it('requires approval for public user-sourced first page mutations', () => {
    const service = new AuthorizationService(policy({
      allow: true,
      requiresApproval: false,
      reason: 'allowed',
      risk: 'medium'
    }));

    expect(service.authorize({
      ...baseContext,
      tool: 'bh_action_click',
      title: 'Click Action',
      risk: 'medium',
      changedPageExpected: true,
      source: 'user',
      userTask: 'Summarize this page without clicking.',
      targetSummary: 'Continue',
      firstMutationRequiresApproval: true
    })).toMatchObject({
      allow: false,
      requiresApproval: true,
      reason: 'First page-mutating action requires approval before execution',
      risk: 'medium'
    });
  });
});
