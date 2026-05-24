import { describe, expect, it } from 'vitest';

import { loopSessionStatusSchema } from '../../../../src/shared/schemas/runState.schema';

describe('loopSessionStatusSchema', () => {
  it('accepts v0.1 statuses', () => {
    expect(loopSessionStatusSchema.parse('running')).toBe('running');
    expect(loopSessionStatusSchema.parse('waiting_for_approval')).toBe(
      'waiting_for_approval'
    );
    expect(loopSessionStatusSchema.parse('paused')).toBe('paused');
    expect(loopSessionStatusSchema.parse('cancelled')).toBe('cancelled');
    expect(loopSessionStatusSchema.parse('finished')).toBe('finished');
    expect(loopSessionStatusSchema.parse('failed')).toBe('failed');
  });

  it('rejects invalid status', () => {
    expect(() => loopSessionStatusSchema.parse('unknown')).toThrowError();
  });
});
