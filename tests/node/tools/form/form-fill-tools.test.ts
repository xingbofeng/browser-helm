import { describe, expect, it } from 'vitest';

import { bhFormInferFillPlan } from '../../../../src/tools/form/bh-form-infer-fill-plan';
import { bhFormFillField } from '../../../../src/tools/form/bh-form-fill-field';
import { bhFormFillMany } from '../../../../src/tools/form/bh-form-fill-many';
import { bhFormVerify } from '../../../../src/tools/form/bh-form-verify';
import { bhFormSubmitWithApproval } from '../../../../src/tools/form/bh-form-submit-with-approval';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import type { ContentRpcResponse } from '../../../../src/page/messaging/content-rpc.schema';
import { fillPlanSchema, fillFieldResultSchema, fillManyResultSchema } from '../../../../src/shared/schemas/form-fill.schema';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';

function noRpc(): ContentRpcClient {
  return { request: async () => ({ ok: false as const, code: 'UNREACHABLE', message: 'unexpected' }) };
}
const ctx = { runId: 'test', stepId: 'step-1' };

describe('bhFormInferFillPlan', () => {
  const tool = bhFormInferFillPlan(noRpc());

  it('infer known field types', async () => {
    const r = await tool.execute({ userTask: 'fill test@example.com', formSummary: 'reg form', fields: [
      { refId: 'r1', label: '邮箱', type: 'email' },
      { refId: 'r2', label: '密码', type: 'password', sensitive: true },
      { refId: 'r3', type: 'file' },
    ] }, ctx);
    expect(r.ok).toBe(true);
    const d = fillPlanSchema.parse(r.data);
    expect(d.fields.find(f => f.fieldRefId === 'r1')!.source).toBe('user-task');
    expect(d.skippedFields.find(f => f.fieldRefId === 'r2')!.reason).toContain('敏感');
    expect(d.skippedFields.find(f => f.fieldRefId === 'r3')!.reason).toContain('上传');
  });

  it('skips disabled fields', async () => {
    const r = await tool.execute({ userTask: 'x', formSummary: 'x', fields: [{ refId: 'r1', type: 'text', disabled: true }] }, ctx);
    const parsed = fillPlanSchema.parse(r.data);
    expect(parsed.skippedFields[0]?.reason ?? '').toContain('禁用');
  });

  it('infers checkbox from task context', async () => {
    const r = await tool.execute({ userTask: '勾选同意', formSummary: 'x', fields: [{ refId: 'r1', label: '同意条款', type: 'checkbox' }] }, ctx);
    const cb = fillPlanSchema.parse(r.data).fields.find(f => f.fieldRefId === 'r1')!;
    expect(cb.requestedValue).toBe('true');
  });

  it('infers marketing checkbox opt-out from negative task context', async () => {
    const r = await tool.execute({
      userTask: '不要勾选营销，不接收 Apple 电子邮件',
      formSummary: 'account form',
      fields: [
        {
          refId: 'updates',
          label: '通知 接收 Apple 电子邮件和营销内容',
          type: 'checkbox',
          valuePreview: 'checked'
        }
      ]
    }, ctx);
    const cb = fillPlanSchema.parse(r.data).fields.find(f => f.fieldRefId === 'updates')!;
    expect(cb.requestedValue).toBe('false');
    expect(cb.skipReason).toBeUndefined();
  });

  it('does not fabricate default values when the user did not provide them', async () => {
    const r = await tool.execute({ userTask: '帮我填写这个表单', formSummary: 'reg form', fields: [
      { refId: 'email', label: '邮箱', type: 'email' },
      { refId: 'phone', label: '手机号码', type: 'tel' },
      { refId: 'date', label: '日期', type: 'date' },
      { refId: 'url', label: '网址', type: 'url' },
      { refId: 'number', label: '数量', type: 'number' },
    ] }, ctx);
    const parsed = fillPlanSchema.parse(r.data);

    expect(JSON.stringify(parsed)).not.toContain('user@example.com');
    expect(JSON.stringify(parsed)).not.toContain('13800138000');
    expect(JSON.stringify(parsed)).not.toContain('https://example.com');
    expect(parsed.fields.every((field) => field.skipReason)).toBe(true);
  });

  it('fills only the best free-text input for Chinese type-into tasks', async () => {
    const r = await tool.execute({
      userTask: '帮我给页面的home 下面那个输入框输入一个“这是什么”',
      formSummary: 'github dashboard',
      fields: [
        { refId: 'repo_search', label: 'Find a repository…', type: 'text', valuePreview: 'empty' },
        { refId: 'ask_box', label: 'Ask anything or type @ to add context', type: 'textarea', valuePreview: 'empty' },
        { refId: 'follow_submit', label: 'Follow kozeghong', type: 'submit', valuePreview: 'non-empty' }
      ]
    }, ctx);
    const parsed = fillPlanSchema.parse(r.data);

    expect(parsed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldRefId: 'ask_box',
          requestedValue: '这是什么',
          confidence: 'high'
        }),
        expect.objectContaining({
          fieldRefId: 'repo_search',
          skipReason: '已有更匹配字段'
        })
      ])
    );
    expect(parsed.fields.filter((field) => field.requestedValue === '这是什么')).toHaveLength(1);
  });

  it('leaves search field value selection to the planner', async () => {
    const r = await tool.execute({
      userTask: '帮我搜索 “美国”',
      formSummary: 'google home',
      fields: [
        { refId: 'search_box', label: '搜索', name: 'q', type: 'search', valuePreview: 'empty' },
        { refId: 'lucky_button', label: '手气不错', type: 'submit', valuePreview: 'non-empty' }
      ]
    }, ctx);
    const parsed = fillPlanSchema.parse(r.data);

    expect(parsed.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldRefId: 'search_box',
          skipReason: '需要 planner 选择'
        })
      ])
    );
  });
});

describe('bhFormFillField', () => {
  it('fills via RPC', async () => {
    const calls: string[] = [];
    const rpc: ContentRpcClient = { request: async (message) => {
      calls.push(message.type);
      if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
        return { ok: true, actionToken: 'form-fill-token' } satisfies ContentRpcResponse;
      }
      expect(message).toMatchObject({ actionToken: 'form-fill-token' });
      return { ok: true, fillFieldResult: { fieldRefId: 'r1', type: 'text', status: 'filled', actualValuePreview: 'non-empty', maskedActualValue: '[MASKED]' } } satisfies ContentRpcResponse;
    } };
    const r = await bhFormFillField(rpc).execute({ fieldRefId: 'r1', value: 'hello' }, ctx);
    expect(r.ok).toBe(true);
    expect(fillFieldResultSchema.parse(r.data).status).toBe('filled');
    expect(calls).toEqual([
      CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE,
      CONTENT_RPC_MESSAGES.FORM_FILL_FIELD
    ]);
  });

  it('returns error on RPC failure', async () => {
    const rpc: ContentRpcClient = { request: async () => ({ ok: false, code: 'REF_STALE', message: 'x' } satisfies ContentRpcResponse) };
    const r = await bhFormFillField(rpc).execute({ fieldRefId: 'r1', value: 'x' }, ctx);
    expect(r.ok).toBe(false);
  });
});

describe('bhFormFillMany', () => {
  it('returns partial result', async () => {
    const rpc: ContentRpcClient = { request: async (message) => {
      if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
        return { ok: true, actionToken: 'form-many-token' } satisfies ContentRpcResponse;
      }
      expect(message).toMatchObject({ actionToken: 'form-many-token' });
      return { ok: true, fillManyResult: { ok: true, fields: [
      { fieldRefId: 'r1', type: 'text', status: 'filled' },
      { fieldRefId: 'r2', type: 'password', status: 'skipped', skipReason: 's' },
    ], filledCount: 1, skippedCount: 1, failedCount: 0, changedPage: true, requiresObserve: false, summary: 'part' } } satisfies ContentRpcResponse;
    } };
    const r = await bhFormFillMany(rpc).execute({ fields: [{ fieldRefId: 'r1', value: 'a' }, { fieldRefId: 'r2', value: 'x' }] }, ctx);
    const data = fillManyResultSchema.parse(r.data);
    expect(data.filledCount).toBe(1);
    expect(data.skippedCount).toBe(1);
  });
});

describe('bhFormVerify', () => {
  it('pass', async () => {
    const rpc: ContentRpcClient = { request: async () => ({ ok: true, verifyResult: { status: 'pass', allValid: true, missingRequired: [], invalidFields: [], fieldResults: [{ fieldRefId: 'r1', valid: true, required: true, filled: true }], visibleErrorText: [], submitAvailable: true, warnings: [] } } satisfies ContentRpcResponse) };
    const r = await bhFormVerify(rpc).execute({ fieldRefIds: ['r1'] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.summary).toContain('passed');
  });

  it('fail', async () => {
    const rpc: ContentRpcClient = { request: async () => ({ ok: true, verifyResult: { status: 'fail', allValid: false, missingRequired: [{ fieldRefId: 'r1', valid: false, required: true, filled: false }], invalidFields: [], fieldResults: [{ fieldRefId: 'r1', valid: false, required: true, filled: false }], visibleErrorText: ['x'], submitAvailable: false, warnings: [] } } satisfies ContentRpcResponse) };
    const r = await bhFormVerify(rpc).execute({ fieldRefIds: ['r1'] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.code).toBe(ERROR_CODES.OK);
    expect((r.data as { status?: string }).status).toBe('fail');
  });
});

describe('bhFormSubmitWithApproval', () => {
  it('returns APPROVAL_REQUIRED', async () => {
    const r = await bhFormSubmitWithApproval(noRpc()).execute({ formName: 'reg', submitMethod: 'button-click', verifyStatus: 'pass', verifyFailed: false, fieldCount: 2, filledCount: 2, skippedCount: 0, riskExplanation: 'x', fields: [{ fieldRefId: 'r1', label: 'Email', type: 'email', valuePreview: 'a@b', isSensitive: false }], warnings: [] }, ctx);
    expect(r.code).toBe(ERROR_CODES.APPROVAL_REQUIRED);
    expect(r.requiresApproval).toBe(true);
    expect(r.summary).toContain('Awaiting approval');
  });

  it('shows high risk when verify failed', async () => {
    const r = await bhFormSubmitWithApproval(noRpc()).execute({ formName: 'pay', submitMethod: 'button-click', verifyStatus: 'fail', verifyFailed: true, fieldCount: 1, filledCount: 0, skippedCount: 1, riskExplanation: 'missing', fields: [], warnings: [] }, ctx);
    expect(r.summary).toContain('High-risk');
    expect(r.data).toBeDefined();
    expect((r.data as { highRisk: boolean }).highRisk).toBe(true);
  });
});

describe('tool registration', () => {
  it('all form fill tools registerable', () => {
    const reg = new ToolRegistry();
    const rpc = noRpc();
    reg.register(bhFormInferFillPlan(rpc));
    reg.register(bhFormFillField(rpc));
    reg.register(bhFormFillMany(rpc));
    reg.register(bhFormVerify(rpc));
    reg.register(bhFormSubmitWithApproval(rpc));
    const names = reg.list().map((t) => t.name);
    expect(names).toContain('bh_form_infer_fill_plan');
    expect(names).toContain('bh_form_fill_field');
    expect(names).toContain('bh_form_fill_many');
    expect(names).toContain('bh_form_verify');
    expect(names).toContain('bh_form_submit_with_approval');
  });

  it('form tools visible in form mode', () => {
    const reg = new ToolRegistry();
    const rpc = noRpc();
    reg.register(bhFormSubmitWithApproval(rpc));
    reg.register(bhFormInferFillPlan(rpc));
    reg.register(bhFormFillField(rpc));
    const router = new ToolRouter(reg);
    const contracts = router.listToolContracts('form');
    const names = contracts.map((t) => t.name);
    expect(names).toContain('bh_form_infer_fill_plan');
    expect(names).toContain('bh_form_submit_with_approval');
    expect(names).toContain('bh_form_fill_field');
  });
});
