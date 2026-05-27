import { describe, expect, it } from 'vitest';
import { DefaultToolRuntimeAdapter } from '../../../../../../src/background/runtime/run/tools/adapters/default-tool-runtime-adapter';

describe('DefaultToolRuntimeAdapter', () => {
  const adapter = new DefaultToolRuntimeAdapter();
  const input = { runId: 'run_1', tool: 'unknown_tool', args: {} };

  it('returns empty array for beforeExecution', () => {
    expect(adapter.beforeExecution(input, {})).toEqual([]);
  });

  it('returns empty array for afterExecution', () => {
    const result = { ok: true, code: 'OK', summary: 'done', changedPage: false, requiresObserve: false };
    expect(adapter.afterExecution(input, result)).toEqual([]);
  });

  it('returns empty array for afterApprovalRequested', () => {
    const result = { ok: true, code: 'OK', summary: 'done', changedPage: false, requiresObserve: false };
    expect(adapter.afterApprovalRequested(input, result)).toEqual([]);
  });
});
