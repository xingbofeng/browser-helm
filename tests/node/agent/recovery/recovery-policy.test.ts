import { describe, expect, it } from 'vitest';

import {
  RecoveryBudget,
  chooseRecoveryAction
} from '../../../../src/agent/recovery/recovery-policy';

describe('recovery-policy', () => {
  it('maps stale and changed page errors to re-observe', () => {
    expect(chooseRecoveryAction('REF_STALE').type).toBe('re_observe');
    expect(chooseRecoveryAction('PAGE_CHANGED').type).toBe('re_observe');
  });

  it('maps args and model output errors to repair/fail actions', () => {
    expect(chooseRecoveryAction('TOOL_ARGS_INVALID').type).toBe('repair_tool_args');
    expect(chooseRecoveryAction('MODEL_OUTPUT_INVALID').type).toBe('repair_tool_args');
    expect(chooseRecoveryAction('MAX_STEPS_EXCEEDED').type).toBe('ask_user');
  });

  it('limits automatic recovery attempts per error code', () => {
    const budget = new RecoveryBudget(1);

    expect(budget.consume('REF_STALE').budgetRemaining).toBe(0);
    const exhausted = budget.consume('REF_STALE');

    expect(exhausted.action.type).toBe('fail');
    expect(exhausted.limitation).toContain('budget exhausted');
  });
});
