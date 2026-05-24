import type { ToolRisk } from '../../shared/schemas/tool-result.schema';

export const riskLabels: Record<ToolRisk, string> = {
  safe: '安全',
  low: '低风险',
  medium: '中风险',
  high: '高风险'
};
