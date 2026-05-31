export type CoordinateRiskInput = {
  x: number;
  y: number;
  reason: string;
};

export type CoordinateRisk = {
  risk: 'medium' | 'high';
  requiresApproval: boolean;
  reason: string;
};

const HIGH_RISK_TEXT = /pay|payment|purchase|buy|submit|send|delete|remove|confirm|transfer|password|secret|token|upload|付款|支付|购买|提交|发送|删除|确认|转账|密码|上传/iu;

export function classifyCoordinateRisk(input: CoordinateRiskInput): CoordinateRisk {
  const high = HIGH_RISK_TEXT.test(input.reason);
  return {
    risk: high ? 'high' : 'medium',
    requiresApproval: high,
    reason: high
      ? 'Sensitive coordinate action requires explicit approval'
      : 'Coordinate click allowed only as visual fallback'
  };
}
