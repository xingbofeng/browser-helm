import type { TranslationKey } from '../../i18n/types';
import { useT } from '../../i18n/context';
import type { ToolRisk } from '../../shared/schemas/tool-result.schema';

const RISK_KEY = {
  safe: 'risk.safe',
  low: 'risk.low',
  medium: 'risk.medium',
  high: 'risk.high',
} as const satisfies Record<ToolRisk, TranslationKey>;

type ApprovalRiskBadgeProps = {
  risk: ToolRisk;
};

export function ApprovalRiskBadge({ risk }: ApprovalRiskBadgeProps) {
  const t = useT();
  return <span className={`bh-risk bh-risk-${risk}`}>{t(RISK_KEY[risk])}</span>;
}
