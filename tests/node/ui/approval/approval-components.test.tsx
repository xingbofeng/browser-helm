import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ApprovalDrawer } from '../../../../src/ui/approval/approval-drawer';
import { ApprovalRiskBadge } from '../../../../src/ui/approval/approval-risk-badge';

describe('approval UI components', () => {
  it('renders risk labels for all levels', () => {
    const html = renderToString(
      <>
        <ApprovalRiskBadge risk="safe" />
        <ApprovalRiskBadge risk="low" />
        <ApprovalRiskBadge risk="medium" />
        <ApprovalRiskBadge risk="high" />
      </>
    );

    expect(html).toContain('安全');
    expect(html).toContain('低风险');
    expect(html).toContain('中风险');
    expect(html).toContain('高风险');
  });

  it('renders approval drawer with masked args and no submit capability claims', () => {
    const html = renderToString(
      <ApprovalDrawer
        request={{
          id: 'apr_1',
          runId: 'run_1',
          stepId: 'step_1',
          tool: 'bh_iframe_type',
          argsPreview: {
            password: 'secret',
            refId: 'frame_1:ref_2'
          },
          risk: 'high',
          reason: 'Sensitive input',
          actionPreview: 'Type into password field',
          status: 'pending',
          createdAt: 1
        }}
        decisionError="Approval request not found"
        decision={undefined}
        onApprove={() => undefined}
        onDeny={() => undefined}
      />
    );

    expect(html).toContain('Type into password field');
    expect(html).toContain('Sensitive input');
    expect(html).toContain('bh_iframe_type');
    expect(html).toContain('[MASKED]');
    expect(html).toContain('Approval request not found');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('iframe_submit');
    expect(html).not.toContain('submit-with-approval');
  });
});
