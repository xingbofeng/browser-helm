import { describe, expect, it } from 'vitest';
import {
  isRecord,
  readString,
  eventTimestamp,
  normalizeAgentTraceEvents,
  lastEvent,
  payloadRecord,
  stringPayload,
  numberPayload,
  payloadSummary,
  isEventAfter,
  withTimeout,
  approvalRequestForTrace,
  redactApprovalArgsPreview
} from '../../../../src/background/runtime/run/runtime-event-utils';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isRecord([1, 2])).toBe(false);
    expect(isRecord([])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

describe('readString', () => {
  it('returns non-empty strings', () => {
    expect(readString('hello')).toBe('hello');
  });

  it('returns undefined for empty string', () => {
    expect(readString('')).toBeUndefined();
  });

  it('returns undefined for non-strings', () => {
    expect(readString(42)).toBeUndefined();
    expect(readString(null)).toBeUndefined();
    expect(readString(undefined)).toBeUndefined();
    expect(readString({})).toBeUndefined();
  });
});

describe('eventTimestamp', () => {
  it('returns timestamp when present', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'test', timestamp: 1000 };
    expect(eventTimestamp(event)).toBe(1000);
  });

  it('returns undefined when no timestamp', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'test' };
    expect(eventTimestamp(event)).toBeUndefined();
  });

  it('returns undefined when timestamp is not a number', () => {
    const event = { runId: 'r1', type: 'test', timestamp: 'not-a-number' } as unknown as RuntimeEvent;
    expect(eventTimestamp(event)).toBeUndefined();
  });
});

describe('normalizeAgentTraceEvents', () => {
  it('adds runId and agentRunId to each event', () => {
    const trace = [
      { runId: 'agent_1', type: 'task_classified', payload: { classification: 'form' } }
    ];
    const result = normalizeAgentTraceEvents('run_42', trace);
    expect(result).toHaveLength(1);
    expect(result[0]!.runId).toBe('run_42');
    expect((result[0]!.payload as Record<string, unknown>).agentRunId).toBe('agent_1');
    expect((result[0]!.payload as Record<string, unknown>).classification).toBe('form');
  });

  it('wraps non-object payloads with agentRunId', () => {
    const trace = [
      { runId: 'agent_1', type: 'test', payload: 'simple-value' }
    ];
    const result = normalizeAgentTraceEvents('run_1', trace);
    expect(result[0]!.payload).toEqual({
      value: 'simple-value',
      agentRunId: 'agent_1'
    });
  });

  it('wraps array payloads with agentRunId', () => {
    const trace = [
      { runId: 'agent_1', type: 'test', payload: [1, 2, 3] }
    ];
    const result = normalizeAgentTraceEvents('run_1', trace);
    expect(result[0]!.payload).toEqual({
      value: [1, 2, 3],
      agentRunId: 'agent_1'
    });
  });

  it('handles empty trace', () => {
    expect(normalizeAgentTraceEvents('run_1', [])).toEqual([]);
  });
});

describe('lastEvent', () => {
  it('returns the last matching event', () => {
    const trace: RuntimeEvent[] = [
      { runId: 'r1', type: 'a', timestamp: 1 },
      { runId: 'r1', type: 'b', timestamp: 2 },
      { runId: 'r1', type: 'a', timestamp: 3 }
    ];
    expect(lastEvent(trace, 'a')).toEqual(trace[2]);
  });

  it('returns undefined when no match', () => {
    const trace: RuntimeEvent[] = [
      { runId: 'r1', type: 'a', timestamp: 1 }
    ];
    expect(lastEvent(trace, 'b')).toBeUndefined();
  });

  it('returns undefined for empty trace', () => {
    expect(lastEvent([], 'a')).toBeUndefined();
  });
});

describe('payloadRecord', () => {
  it('returns object payloads', () => {
    expect(payloadRecord({ a: 1 })).toEqual({ a: 1 });
  });

  it('returns empty object for non-objects', () => {
    expect(payloadRecord(null)).toEqual({});
    expect(payloadRecord('string')).toEqual({});
    expect(payloadRecord(42)).toEqual({});
    expect(payloadRecord(undefined)).toEqual({});
  });
});

describe('stringPayload', () => {
  it('returns non-empty trimmed strings', () => {
    expect(stringPayload('hello')).toBe('hello');
  });

  it('masks provider secrets', () => {
    expect(stringPayload('key sk-abcdefghij1234567890 end')).toContain('[MASKED]');
  });

  it('returns undefined for empty or whitespace strings', () => {
    expect(stringPayload('')).toBeUndefined();
    expect(stringPayload('   ')).toBeUndefined();
  });

  it('returns undefined for non-strings', () => {
    expect(stringPayload(42)).toBeUndefined();
    expect(stringPayload(null)).toBeUndefined();
  });
});

describe('numberPayload', () => {
  it('returns finite numbers', () => {
    expect(numberPayload(42)).toBe(42);
    expect(numberPayload(0)).toBe(0);
    expect(numberPayload(-1)).toBe(-1);
  });

  it('returns undefined for non-finite numbers', () => {
    expect(numberPayload(Infinity)).toBeUndefined();
    expect(numberPayload(NaN)).toBeUndefined();
  });

  it('returns undefined for non-numbers', () => {
    expect(numberPayload('42')).toBeUndefined();
    expect(numberPayload(null)).toBeUndefined();
  });
});

describe('payloadSummary', () => {
  it('extracts message from payload', () => {
    expect(payloadSummary({ message: 'something failed' })).toBe('something failed');
  });

  it('masks secrets in message', () => {
    const result = payloadSummary({ message: 'key sk-abcdefghij1234567890 leaked' });
    expect(result).toContain('[MASKED]');
  });

  it('returns default for non-object payloads', () => {
    expect(payloadSummary(null)).toBe('stream_failed');
    expect(payloadSummary(undefined)).toBe('stream_failed');
    expect(payloadSummary('string')).toBe('stream_failed');
  });

  it('returns default when message is not a string', () => {
    expect(payloadSummary({ message: 42 })).toBe('stream_failed');
    expect(payloadSummary({})).toBe('stream_failed');
  });
});

describe('isEventAfter', () => {
  it('returns true when event is after reference', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'a', timestamp: 200 };
    const ref: RuntimeEvent = { runId: 'r1', type: 'b', timestamp: 100 };
    expect(isEventAfter(event, ref)).toBe(true);
  });

  it('returns true when timestamps are equal', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'a', timestamp: 100 };
    const ref: RuntimeEvent = { runId: 'r1', type: 'b', timestamp: 100 };
    expect(isEventAfter(event, ref)).toBe(true);
  });

  it('returns false when event is before reference', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'a', timestamp: 50 };
    const ref: RuntimeEvent = { runId: 'r1', type: 'b', timestamp: 100 };
    expect(isEventAfter(event, ref)).toBe(false);
  });

  it('returns false when either event is undefined', () => {
    const event: RuntimeEvent = { runId: 'r1', type: 'a', timestamp: 100 };
    expect(isEventAfter(undefined, event)).toBe(false);
    expect(isEventAfter(event, undefined)).toBe(false);
    expect(isEventAfter(undefined, undefined)).toBe(false);
  });
});

describe('withTimeout', () => {
  it('returns the value when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 1000);
    expect(result).toBe(42);
  });

  it('returns undefined when promise times out', async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve('late'), 500);
    });
    const result = await withTimeout(slow, 10);
    expect(result).toBeUndefined();
  });
});

describe('approvalRequestForTrace', () => {
  it('redacts valuePreview in fields', () => {
    const request = {
      id: 'req_1',
      argsPreview: {
        fields: [
          { fieldRefId: 'ref_1', valuePreview: 'secret-value' },
          { fieldRefId: 'ref_2', valuePreview: 'another-secret' }
        ]
      }
    };
    const result = approvalRequestForTrace(request);
    expect(result.id).toBe('req_1');
    const fields = (result.argsPreview as Record<string, unknown[]>).fields;
    expect(fields![0]).toMatchObject({ fieldRefId: 'ref_1', valuePreview: '******' });
    expect(fields![1]).toMatchObject({ fieldRefId: 'ref_2', valuePreview: '******' });
  });

  it('preserves argsPreview without fields', () => {
    const request = {
      id: 'req_2',
      argsPreview: { tool: 'test', summary: 'ok' }
    };
    const result = approvalRequestForTrace(request);
    expect(result.argsPreview).toEqual({ tool: 'test', summary: 'ok' });
  });
});

describe('redactApprovalArgsPreview', () => {
  it('redacts valuePreview in nested field arrays', () => {
    const input = {
      fields: [
        { fieldRefId: 'f1', valuePreview: 'secret' }
      ]
    };
    const result = redactApprovalArgsPreview(input);
    expect(result).toEqual({
      fields: [
        { fieldRefId: 'f1', valuePreview: '******' }
      ]
    });
  });

  it('handles arrays of records', () => {
    const input = [
      { fields: [{ valuePreview: 'a' }] },
      { fields: [{ valuePreview: 'b' }] }
    ];
    const result = redactApprovalArgsPreview(input);
    expect(result).toEqual([
      { fields: [{ valuePreview: '******' }] },
      { fields: [{ valuePreview: '******' }] }
    ]);
  });

  it('returns non-record values unchanged', () => {
    expect(redactApprovalArgsPreview('hello')).toBe('hello');
    expect(redactApprovalArgsPreview(42)).toBe(42);
    expect(redactApprovalArgsPreview(null)).toBe(null);
  });

  it('recursively processes nested objects', () => {
    const input = {
      outer: {
        fields: [{ valuePreview: 'deep-secret' }]
      }
    };
    const result = redactApprovalArgsPreview(input);
    expect(result).toEqual({
      outer: {
        fields: [{ valuePreview: '******' }]
      }
    });
  });

  it('handles fields with non-record entries', () => {
    const input = {
      fields: ['not-a-record', { valuePreview: 'secret' }]
    };
    const result = redactApprovalArgsPreview(input);
    expect(result).toEqual({
      fields: ['not-a-record', { valuePreview: '******' }]
    });
  });
});
