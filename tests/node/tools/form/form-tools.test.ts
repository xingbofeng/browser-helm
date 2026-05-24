import { describe, expect, it } from 'vitest';

import { bhFormFindDisabledSubmitReason } from '../../../../src/tools/form/bh-form-find-disabled-submit-reason';
import { bhFormFindMissingRequired } from '../../../../src/tools/form/bh-form-find-missing-required';
import { bhFormFindValidationErrors } from '../../../../src/tools/form/bh-form-find-validation-errors';
import { bhFormInspect } from '../../../../src/tools/form/bh-form-inspect';
import { bhFormList } from '../../../../src/tools/form/bh-form-list';
import { bhFormReadFields } from '../../../../src/tools/form/bh-form-read-fields';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';

const emailField = {
  refId: 'ref_email',
  label: '邮箱',
  name: 'email',
  type: 'email',
  required: true,
  disabled: false,
  sensitive: false,
  valuePreview: '',
  validation: {
    valid: false,
    message: '请填写邮箱',
    ariaInvalid: true
  },
  submit: {
    refId: 'ref_submit',
    disabled: true,
    reason: {
      kind: 'inferred',
      message: '必填字段为空',
      fieldRefId: 'ref_email'
    }
  },
  warnings: []
};

const passwordField = {
  refId: 'ref_password',
  label: '密码',
  name: 'password',
  type: 'password',
  required: false,
  disabled: false,
  sensitive: true,
  valuePreview: '[MASKED]',
  validation: {
    valid: true
  },
  submit: emailField.submit,
  warnings: []
};

describe('v0.32 form read-only tools', () => {
  it('lists, inspects, and reads form fields in form/debug modes', async () => {
    const registry = new ToolRegistry();
    const rpc = formRpc();
    registry.register(bhFormList(rpc));
    registry.register(bhFormInspect(rpc));
    registry.register(bhFormReadFields(rpc));
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('form').map((tool) => tool.name)).toEqual([
      'bh_form_list',
      'bh_form_inspect',
      'bh_form_read_fields'
    ]);
    expect(router.listToolContracts('debug').map((tool) => tool.name)).toEqual([
      'bh_form_list',
      'bh_form_inspect',
      'bh_form_read_fields'
    ]);

    const list = await router.execute(
      { tool: 'bh_form_list', args: {} },
      { runId: 'run_1', stepId: 'step_1', runMode: 'form' }
    );
    const inspect = await router.execute(
      { tool: 'bh_form_inspect', args: {} },
      { runId: 'run_1', stepId: 'step_2', runMode: 'form' }
    );
    const fields = await router.execute(
      { tool: 'bh_form_read_fields', args: {} },
      { runId: 'run_1', stepId: 'step_3', runMode: 'form' }
    );

    expect(list.data).toMatchObject({ count: 1 });
    expect(inspect.data).toMatchObject({ fields: [emailField, passwordField] });
    expect(fields.data).toMatchObject({ count: 2, fields: [emailField, passwordField] });
  });

  it('finds missing required fields and validation errors in form mode', async () => {
    const missing = await bhFormFindMissingRequired(formRpc()).execute(
      {},
      { runId: 'run_1', stepId: 'step_1', runMode: 'form' }
    );
    const errors = await bhFormFindValidationErrors(formRpc()).execute(
      {},
      { runId: 'run_1', stepId: 'step_2', runMode: 'form' }
    );

    expect(missing.data).toMatchObject({ count: 1, fields: [emailField] });
    expect(errors.data).toMatchObject({ count: 1, fields: [emailField] });
  });

  it('finds disabled submit reason with inferred kind in form mode', async () => {
    const result = await bhFormFindDisabledSubmitReason(formRpc()).execute(
      {},
      { runId: 'run_1', stepId: 'step_1', runMode: 'form' }
    );

    expect(result.data).toMatchObject({
      reason: {
        kind: 'inferred',
        fieldRefId: 'ref_email'
      }
    });
  });
});

function formRpc(): ContentRpcClient {
  return {
    async request(message) {
      expect(message.type).toBe(CONTENT_RPC_MESSAGES.PAGE_OBSERVE);
      return {
        ok: true,
        observation: {
          url: 'https://demo.example.com/form',
          title: '表单',
          currentDomain: 'demo.example.com',
          origin: 'https://demo.example.com',
          visibleText: '表单',
          visibleTextSummary: '表单',
          pageStateSummary: '页面包含表单',
          refSummary: [],
          formFields: {
            status: 'ready',
            fields: [emailField, passwordField],
            count: 2,
            submit: emailField.submit,
            warnings: []
          },
          warnings: []
        }
      };
    }
  };
}
