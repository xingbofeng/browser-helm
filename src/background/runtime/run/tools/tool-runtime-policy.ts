import { PolicyEngine } from '../../../../agent/policy/policy-engine';
import type { ToolRisk } from '../../../../shared/schemas/tool-result.schema';

export type PolicyCheckResult = {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
  risk: string;
};

export class ToolRuntimePolicy {
  private readonly engine = new PolicyEngine();

  evaluate(risk: string): PolicyCheckResult {
    const policy = this.engine.evaluate({ risk: risk as ToolRisk, wouldRequireApproval: false });
    return {
      allow: policy.allow,
      requiresApproval: policy.requiresApproval,
      reason: policy.reason,
      risk
    };
  }
}
