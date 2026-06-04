import { describe, expect, it } from 'vitest';

import { validateApprovalBehaviorContracts } from '../../../scripts/release-hygiene-approval-behavior';
import type { ToolSpec } from '../../../src/tools/core/tool-spec';

function tool(input: Partial<ToolSpec<unknown, unknown>> & { name: string }): ToolSpec<unknown, unknown> {
  return {
    name: input.name,
    title: input.title ?? input.name,
    description: input.description ?? input.name,
    modes: input.modes ?? ['advanced'],
    risk: input.risk ?? 'low',
    argsSchema: input.argsSchema ?? ({} as never),
    resultSchema: input.resultSchema ?? ({} as never),
    execute: input.execute ?? (async () => ({
      ok: true,
      code: 'OK',
      summary: 'ok',
      changedPage: false,
      requiresObserve: false
    })),
    ...(input.readOnly !== undefined ? { readOnly: input.readOnly } : {}),
    ...(input.requiresApproval !== undefined ? { requiresApproval: input.requiresApproval } : {}),
    ...(input.approvalBehavior ? { approvalBehavior: input.approvalBehavior } : {})
  };
}

describe('release hygiene approval behavior contract', () => {
  it('requires explicit approvalBehavior for approval-gated tools', () => {
    expect(validateApprovalBehaviorContracts([
      tool({ name: 'bh_missing', risk: 'high' })
    ])).toEqual([
      'Approval-gated tool bh_missing must declare approvalBehavior.'
    ]);
  });

  it('rejects execute-pending tools without an execute-pending approval flow', () => {
    expect(validateApprovalBehaviorContracts([
      tool({
        name: 'bh_unregistered_execute_pending',
        risk: 'medium',
        requiresApproval: true,
        approvalBehavior: 'execute_pending_action'
      })
    ])).toEqual([
      'Tool bh_unregistered_execute_pending declares execute_pending_action but is not registered for execute-pending approval.'
    ]);
  });

  it('rejects custom-flow tools without a custom approval flow', () => {
    expect(validateApprovalBehaviorContracts([
      tool({
        name: 'bh_unregistered_custom',
        risk: 'high',
        approvalBehavior: 'custom_flow'
      })
    ])).toEqual([
      'Tool bh_unregistered_custom declares custom_flow but is not registered for custom approval handling.'
    ]);
  });

  it('accepts record-only approval tools and registered side-effect flows', () => {
    expect(validateApprovalBehaviorContracts([
      tool({
        name: 'bh_file_read_download',
        risk: 'high',
        requiresApproval: true,
        approvalBehavior: 'record_only'
      }),
      tool({
        name: 'bh_cdp_attach',
        risk: 'medium',
        requiresApproval: true,
        approvalBehavior: 'execute_pending_action'
      }),
      tool({
        name: 'bh_clipboard_write_with_approval',
        risk: 'high',
        requiresApproval: true,
        approvalBehavior: 'custom_flow'
      })
    ])).toEqual([]);
  });
});
