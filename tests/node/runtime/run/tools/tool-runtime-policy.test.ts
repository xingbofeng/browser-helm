import { describe, expect, it } from 'vitest';
import { ToolRuntimePolicy } from '../../../../../src/background/runtime/run/tools/tool-runtime-policy';

describe('ToolRuntimePolicy', () => {
  const policy = new ToolRuntimePolicy();

  it('allows low risk tools', () => {
    const result = policy.evaluate('low');
    expect(result.allow).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.risk).toBe('low');
  });

  it('requires approval for high risk tools', () => {
    const result = policy.evaluate('high');
    expect(result.allow).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.risk).toBe('high');
    expect(result.reason).toBeDefined();
  });

  it('allows high risk tools without approval in full mode', () => {
    const result = policy.evaluate('high', 'full');
    expect(result.allow).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.risk).toBe('high');
  });

  it('allows medium risk', () => {
    const result = policy.evaluate('medium');
    expect(result.allow).toBe(true);
    expect(result.risk).toBe('medium');
  });
});
