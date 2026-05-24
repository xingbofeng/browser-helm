import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { FormFieldsTab } from '../../../../src/ui/components/form-fields-tab';
import { InteractiveElementsTab } from '../../../../src/ui/components/interactive-elements-tab';
import { PageObservationTab } from '../../../../src/ui/components/page-observation-tab';
import { RefMapTab } from '../../../../src/ui/components/ref-map-tab';

describe('Cockpit tab views', () => {
  it('renders page observation states', () => {
    const html = renderToString(
      <PageObservationTab
        data={{
          status: 'ready',
          summary: '当前页面为“注册页”',
          count: 1,
          items: [
            {
              url: 'https://example.com/register',
              title: '注册页',
              currentDomain: 'example.com',
              origin: 'https://example.com',
              visibleTextSummary: '邮箱 密码',
              pageStateSummary: '页面包含表单'
            }
          ],
          updatedAt: '2026-05-25T00:00:00.000Z',
          warnings: ['可见文本较长']
        }}
      />
    );

    expect(html).toContain('注册页');
    expect(html).toContain('https://example.com/register');
    expect(html).toContain('邮箱 密码');
    expect(html).toContain('可见文本较长');
  });

  it('renders ref map entries with search-ready text', () => {
    const html = renderToString(
      <RefMapTab
        data={{
          status: 'ready',
          summary: '检测到 1 个 ref',
          count: 1,
          items: [
            {
              refId: 'ref_1',
              role: 'button',
              name: '提交',
              tagName: 'button',
              visible: true,
              disabled: false
            }
          ],
          updatedAt: '2026-05-25T00:00:00.000Z',
          warnings: []
        }}
      />
    );

    expect(html).toContain('ref_1');
    expect(html).toContain('button');
    expect(html).toContain('提交');
  });

  it('renders interactive element state', () => {
    const html = renderToString(
      <InteractiveElementsTab
        data={{
          status: 'ready',
          summary: '1 个交互元素',
          count: 1,
          items: [
            {
              refId: 'ref_switch',
              role: 'switch',
              name: '启用同步',
              tagName: 'button',
              visible: true,
              disabled: false,
              checked: true,
              warnings: []
            }
          ],
          updatedAt: '2026-05-25T00:00:00.000Z',
          warnings: []
        }}
      />
    );

    expect(html).toContain('ref_switch');
    expect(html).toContain('启用同步');
    expect(html).toContain('checked=true');
  });

  it('renders form fields with sensitive values masked and submit reason confidence', () => {
    const html = renderToString(
      <FormFieldsTab
        data={{
          status: 'ready',
          summary: '1 个字段',
          count: 1,
          items: [
            {
              refId: 'ref_email',
              label: '邮箱',
              name: 'email',
              type: 'email',
              required: true,
              disabled: false,
              sensitive: false,
              valuePreview: 'user@example.com',
              validation: {
                valid: false,
                message: '请输入有效邮箱'
              },
              submit: {
                refId: 'ref_submit',
                disabled: true,
                reason: {
                  kind: 'inferred',
                  message: '邮箱格式无效',
                  fieldRefId: 'ref_email'
                }
              },
              warnings: []
            },
            {
              refId: 'ref_api',
              label: 'API Key',
              name: 'apiKey',
              type: 'text',
              required: true,
              disabled: false,
              sensitive: true,
              valuePreview: 'sk-secret',
              validation: {
                valid: true
              },
              warnings: []
            }
          ],
          updatedAt: '2026-05-25T00:00:00.000Z',
          warnings: []
        }}
      />
    );

    expect(html).toContain('邮箱');
    expect(html).toContain('请输入有效邮箱');
    expect(html).toContain('推断');
    expect(html).toContain('[MASKED]');
    expect(html).not.toContain('sk-secret');
  });
});
