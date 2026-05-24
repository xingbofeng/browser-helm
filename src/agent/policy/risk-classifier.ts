import type { ToolRisk } from '../../shared/schemas/tool-result.schema';

export class RiskClassifier {
  requiresApproval(risk: ToolRisk): boolean {
    return risk === 'high';
  }
}
