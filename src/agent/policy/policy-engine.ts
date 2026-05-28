import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import { RiskClassifier } from './risk-classifier';
import { tZh } from '../../i18n/t';

export type PolicyEvaluationInput = {
  risk: ToolRisk;
  wouldRequireApproval: boolean;
  modelRequestedNoApproval?: boolean | undefined;
};

export type PolicyEvaluation = {
  allow: boolean;
  requiresApproval: boolean;
  reason: string;
};

export class PolicyEngine {
  private readonly classifier = new RiskClassifier();

  evaluate(input: PolicyEvaluationInput): PolicyEvaluation {
    const requiresApproval =
      this.classifier.requiresApproval(input.risk) || input.wouldRequireApproval;
    if (requiresApproval) {
      return {
        allow: false,
        requiresApproval: true,
        reason: tZh('policy.approvalRequired')
      };
    }
    return {
      allow: true,
      requiresApproval: false,
      reason: tZh('policy.allowed')
    };
  }
}
