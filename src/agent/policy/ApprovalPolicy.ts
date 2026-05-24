import type { ToolRisk } from '../../shared/schemas/toolResult.schema';
import { RiskClassifier } from './RiskClassifier';

type ApprovalEvaluationInput = {
  risk: ToolRisk;
  requestedByToolResult: boolean;
};

type ApprovalEvaluation = {
  requiresApproval: boolean;
  reason: string;
};

export class ApprovalPolicy {
  private readonly classifier = new RiskClassifier();

  evaluate(input: ApprovalEvaluationInput): ApprovalEvaluation {
    const highRiskApproval = this.classifier.requiresApproval(input.risk);
    const requiresApproval = highRiskApproval || input.requestedByToolResult;
    return {
      requiresApproval,
      reason: requiresApproval
        ? 'Approval required by policy'
        : 'Approval not required'
    };
  }
}
