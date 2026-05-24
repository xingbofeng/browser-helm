import type { ToolRisk } from '../../shared/schemas/tool-result.schema';
import { riskLabels } from '../lib/risk-labels';

type ApprovalRiskBadgeProps = {
  risk: ToolRisk;
};

export function ApprovalRiskBadge({ risk }: ApprovalRiskBadgeProps) {
  return <span className={`bh-risk bh-risk-${risk}`}>{riskLabels[risk]}</span>;
}
