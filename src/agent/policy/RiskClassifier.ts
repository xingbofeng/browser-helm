import type { ToolRisk } from '../../shared/schemas/toolResult.schema';

export class RiskClassifier {
  requiresApproval(risk: ToolRisk): boolean {
    return risk === 'high';
  }
}
