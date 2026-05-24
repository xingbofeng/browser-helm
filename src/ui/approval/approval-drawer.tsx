import type { ApprovalRequest } from '../../shared/schemas/approval.schema';
import { jsonPreview } from '../lib/format-tool';
import { ApprovalRiskBadge } from './approval-risk-badge';

type ApprovalDrawerProps = {
  request?: ApprovalRequest | undefined;
  decision?: 'approved' | 'denied' | undefined;
  decisionError?: string | undefined;
  onApprove: () => void;
  onDeny: () => void;
};

export function ApprovalDrawer(props: ApprovalDrawerProps) {
  if (!props.request) {
    return null;
  }
  return (
    <aside className="bh-approvalDrawer" aria-label="Approval">
      <h2>Approval</h2>
      <ApprovalRiskBadge risk={props.request.risk} />
      <p>{props.request.reason}</p>
      {props.request.actionPreview ? <p>{props.request.actionPreview}</p> : null}
      <p>{props.request.tool}</p>
      <pre>{jsonPreview(props.request.argsPreview)}</pre>
      {props.decisionError ? <p role="alert">{props.decisionError}</p> : null}
      <button type="button" onClick={props.onApprove} disabled={props.decision === 'approved'}>
        Approve
      </button>
      <button type="button" onClick={props.onDeny} disabled={props.decision === 'denied'}>
        Deny
      </button>
    </aside>
  );
}
