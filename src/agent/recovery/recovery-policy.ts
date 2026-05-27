import type {
  RecoveryAction,
  RecoveryState
} from '../../shared/schemas/recovery.schema';
import { recoveryStateSchema } from '../../shared/schemas/recovery.schema';

export function chooseRecoveryAction(code: string): RecoveryAction {
  if (code === 'REF_STALE' || code === 'PAGE_CHANGED') {
    return { type: 're_observe', reason: code };
  }
  if (code === 'TOOL_ARGS_INVALID' || code === 'MODEL_OUTPUT_INVALID') {
    return { type: 'repair_tool_args', reason: code };
  }
  if (code === 'ELEMENT_NOT_FOUND') {
    return { type: 'find_alternative_ref', reason: code };
  }
  if (code === 'FORM_VERIFY_FAILED' || code === 'SUBMIT_DISABLED') {
    return { type: 'repair_tool_args', reason: code };
  }
  if (code === 'SUBMIT_RESULT_UNKNOWN' || code === 'FILL_RETRY_EXHAUSTED') {
    return { type: 're_observe', reason: code };
  }
  if (code === 'MAX_STEPS_EXCEEDED') {
    return { type: 'ask_user', question: '已达到最大步骤数。要继续诊断还是修改目标？' };
  }
  return { type: 'fail', reason: code };
}

export class RecoveryBudget {
  private readonly attempts = new Map<string, number>();

  constructor(private readonly maxAttemptsPerCode = 1) {}

  consume(code: string): RecoveryState {
    const attempts = (this.attempts.get(code) ?? 0) + 1;
    this.attempts.set(code, attempts);
    const budgetRemaining = Math.max(0, this.maxAttemptsPerCode - attempts);
    if (attempts > this.maxAttemptsPerCode) {
      return recoveryStateSchema.parse({
        action: {
          type: 'fail',
          reason: code
        },
        attempts,
        budgetRemaining: 0,
        limitation: `Recovery budget exhausted for ${code}`
      });
    }

    return recoveryStateSchema.parse({
      action: chooseRecoveryAction(code),
      attempts,
      budgetRemaining
    });
  }
}
