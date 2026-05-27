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

  it('renders submit approval details with masked field values', () => {
    const html = renderToString(
      <ApprovalDrawer
        request={{
          id: 'apr_form',
          runId: 'run_1',
          stepId: 'step_1',
          tool: 'bh_form_submit_with_approval',
          argsPreview: {
            formName: 'Registration',
            submitMethod: 'button-click',
            verifyStatus: 'pass',
            fieldCount: 2,
            filledCount: 2,
            skippedCount: 0,
            riskExplanation: '提交前展示字段摘要',
            highRisk: false,
            fields: [
              {
                fieldRefId: 'ref_name',
                label: 'Full Name',
                name: 'name',
                type: 'text',
                valuePreview: 'Counter User',
                isSensitive: false
              },
              {
                fieldRefId: 'ref_token',
                label: 'API Key',
                name: 'api_key',
                type: 'password',
                valuePreview: 'sk-secret',
                isSensitive: true
              }
            ],
            warnings: ['确认提交到当前页面']
          },
          risk: 'high',
          reason: 'Confirm form submit: Registration',
          actionPreview: 'Submit form: Registration',
          status: 'pending',
          createdAt: 1
        }}
        decision={undefined}
        onApprove={() => undefined}
        onDeny={() => undefined}
      />
    );

    expect(html).toContain('Registration');
    expect(html).toContain('button-click');
    expect(html).toContain('2/2 已填写，0 跳过');
    expect(html).toContain('Full Name');
    expect(html).toContain('API Key');
    expect(html).toContain('******');
    expect(html).toContain('显示字段值');
    expect(html).toContain('确认提交到当前页面');
    expect(html).not.toContain('Counter User');
    expect(html).not.toContain('sk-secret');
  });
});
