import type { RunMode } from '../../../../shared/schemas/tool.schema';
import { tZh } from '../../../../i18n/t';

export type PolicyCheckResult = {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
  risk: string;
};

export class ToolRuntimePolicy {
  evaluate(risk: string, _runMode?: RunMode): PolicyCheckResult {
    const requiresApproval = risk === 'high';
    return {
      allow: !requiresApproval,
      requiresApproval,
      reason: requiresApproval
        ? tZh('policy.approvalRequired')
        : tZh('policy.allowed'),
      risk
    };
  }
}
