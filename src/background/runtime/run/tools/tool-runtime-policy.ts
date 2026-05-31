import { PolicyEngine } from '../../../../agent/policy/policy-engine';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { ToolRisk } from '../../../../shared/schemas/tool-result.schema';

export type PolicyCheckResult = {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
  risk: string;
};

export class ToolRuntimePolicy {
  private readonly engine = new PolicyEngine();

  evaluate(risk: string, runMode?: RunMode): PolicyCheckResult {
    if (runMode === 'full' && risk === 'high') {
      return {
        allow: true,
        requiresApproval: false,
        reason: 'Full mode allows high-risk tools without approval interception',
        risk
      };
    }
    const policy = this.engine.evaluate({ risk: risk as ToolRisk, wouldRequireApproval: false });
    return {
      allow: policy.allow,
      requiresApproval: policy.requiresApproval,
      reason: policy.reason,
      risk
    };
  }
}
