import { describe, expect, it } from 'vitest';
import {
  toolStartedEvent,
  toolResultEvent,
  approvalRequiredEvent
} from '../../../../../src/background/runtime/run/tools/tool-runtime-events';
import { TRACE_EVENT_NAMES } from '../../../../../src/shared/constants/event-names';

describe('toolStartedEvent', () => {
  it('returns event with tool name and redacted args', () => {
    const event = toolStartedEvent('run_1', 'bh_test', { some: 'arg' });
    expect(event.type).toBe(TRACE_EVENT_NAMES.TOOL_STARTED);
    expect(event.runId).toBe('run_1');
    expect((event.payload as Record<string, unknown>).tool).toBe('bh_test');
    expect((event.payload as Record<string, unknown>).args).toEqual({ some: 'arg' });
  });
});

describe('toolResultEvent', () => {
  it('returns event with full result fields', () => {
    const result = {
      ok: true,
      code: 'OK',
      summary: 'Done',
      changedPage: true,
      requiresObserve: false,
      requiresApproval: false
    };
    const event = toolResultEvent('run_1', 'bh_test', result);
    expect(event.type).toBe(TRACE_EVENT_NAMES.TOOL_RESULT);
    const p = event.payload as Record<string, unknown>;
    expect(p.tool).toBe('bh_test');
    expect(p.ok).toBe(true);
    expect(p.changedPage).toBe(true);
  });
});

describe('approvalRequiredEvent', () => {
  it('returns event with redacted request', () => {
    const request = {
      id: 'req_1',
      argsPreview: { fields: [{ valuePreview: 'secret' }] }
    };
    const event = approvalRequiredEvent('run_1', request, 'Needs approval');
    expect(event.type).toBe(TRACE_EVENT_NAMES.APPROVAL_REQUIRED);
    const p = event.payload as Record<string, unknown>;
    expect(p.summary).toBe('Needs approval');
  });
});
