import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DiagnosisOverview } from '../../../../src/ui/components/diagnosis-overview';

describe('DiagnosisOverview', () => {
  it('renders mode reason, plan progress, findings and limitations', () => {
    const html = renderToString(
      <DiagnosisOverview
        snapshot={{
          runId: 'run_1',
          mode: 'form',
          status: 'finished',
          refs: [],
          modeReason: 'form: 用户要求诊断表单',
          capabilityLimitations: ['浅层 debug 信号不可用'],
          plan: {
            id: 'plan_1',
            mode: 'form',
            updatedAt: 1,
            steps: [
              {
                id: 'read_fields',
                title: '读取表单字段',
                status: 'done'
              },
              {
                id: 'report',
                title: '输出表单诊断报告',
                status: 'current'
              }
            ]
          },
          findings: [
            {
              title: '必填字段为空',
              explanation: 'Email 为空',
              evidence: [
                {
                  source: 'form',
                  summary: 'Email required empty',
                  refId: 'ref_email'
                }
              ],
              confidence: 'high'
            }
          ],
          debugReport: {
            title: 'Form Doctor 诊断报告',
            findings: [],
            recommendations: [],
            limitations: ['只读诊断，不填写或提交']
          },
          canInterrupt: true,
          canReviseGoal: true
        }}
      />
    );

    expect(html).toContain('诊断概览');
    expect(html).toContain('form: 用户要求诊断表单');
    expect(html).toContain('Form Doctor 诊断报告');
    expect(html).toContain('读取表单字段');
    expect(html).toContain('必填字段为空');
    expect(html).toContain('high');
    expect(html).toContain('只读诊断，不填写或提交');
    expect(html).toContain('可中断');
    expect(html).toContain('可修改目标');
  });
});
