import { describe, expect, it } from 'vitest';

import {
  disabledSubmitReasonSchema,
  elementInspectPayloadSchema,
  elementReadStatePayloadSchema,
  formFieldSnapshotSchema,
  formFindDisabledSubmitReasonPayloadSchema,
  formFindMissingRequiredPayloadSchema,
  formFindValidationErrorsPayloadSchema,
  formInspectPayloadSchema,
  formListPayloadSchema,
  formReadFieldsPayloadSchema,
  formSubmitSummarySchema,
  interactiveElementSchema,
  interactiveFindPayloadSchema,
  refTabDataSchema,
  structuredPageContextSummarySchema,
  structuredPageDataSchema,
  tabDataSchema,
  tabDataStatusSchema
} from '../../../../src/shared/schemas/structured-page-data.schema';

const refItem = {
  refId: 'ref_101',
  role: 'button',
  name: '提交',
  tagName: 'button',
  visible: true,
  disabled: true
};

describe('structured page data schemas', () => {
  it('accepts every supported tab status', () => {
    expect(tabDataStatusSchema.options).toEqual([
      'ready',
      'empty',
      'partial',
      'error',
      'unsupported'
    ]);
  });

  it('requires the common tab data envelope fields', () => {
    const parsed = refTabDataSchema.parse({
      status: 'ready',
      summary: '检测到 1 个 ref',
      count: 1,
      items: [refItem],
      updatedAt: '2026-05-24T05:00:00.000Z',
      warnings: []
    });

    expect(parsed.count).toBe(1);
    expect(parsed.items[0]?.refId).toBe('ref_101');
  });

  it('distinguishes empty tab data from unsupported tab data', () => {
    const emptyTab = tabDataSchema.parse({
      status: 'empty',
      summary: '未检测到 ref',
      count: 0,
      items: [],
      updatedAt: '2026-05-24T05:00:00.000Z',
      warnings: [],
      emptyReason: 'NO_REFS_DETECTED'
    });
    const unsupportedTab = tabDataSchema.parse({
      status: 'unsupported',
      summary: '当前观察未包含表单字段数据；请使用表单读取能力获取字段快照',
      count: 0,
      items: [],
      updatedAt: '2026-05-24T05:00:00.000Z',
      warnings: []
    });

    expect(emptyTab.status).toBe('empty');
    expect(emptyTab.emptyReason).toBe('NO_REFS_DETECTED');
    expect(unsupportedTab.status).toBe('unsupported');
    expect(unsupportedTab.emptyReason).toBeUndefined();
  });

  it('rejects empty tab data without an empty reason', () => {
    expect(() =>
      tabDataSchema.parse({
        status: 'empty',
        summary: '未检测到 ref',
        count: 0,
        items: [],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      })
    ).toThrow();
  });

  it('accepts structured page data with four tab categories', () => {
    const parsed = structuredPageDataSchema.parse({
      observation: {
        status: 'ready',
        summary: '当前页面为“创建账号”',
        count: 1,
        items: [
          {
            url: 'https://demo.example.com/register',
            title: '欢迎注册 - 示例网站',
            currentDomain: 'demo.example.com',
            origin: 'https://demo.example.com',
            visibleTextSummary: '创建账号 注册即可体验全部功能',
            pageStateSummary: '页面包含 1 个可交互元素'
          }
        ],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      refs: {
        status: 'ready',
        summary: '检测到 1 个 ref',
        count: 1,
        items: [refItem],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      interactive: {
        status: 'ready',
        summary: '从 ref summary 浅层派生 1 个交互元素',
        count: 1,
        items: [refItem],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      },
      forms: {
        status: 'unsupported',
        summary: '当前观察未包含表单字段数据；请使用表单读取能力获取字段快照',
        count: 0,
        items: [],
        updatedAt: '2026-05-24T05:00:00.000Z',
        warnings: []
      }
    });

    expect(parsed.forms.status).toBe('unsupported');
    expect(parsed.interactive.items[0]?.refId).toBe('ref_101');
  });

  it('accepts deterministic context summary without full items', () => {
    const parsed = structuredPageContextSummarySchema.parse({
      url: 'https://demo.example.com/register',
      title: '欢迎注册 - 示例网站',
      currentDomain: 'demo.example.com',
      origin: 'https://demo.example.com',
      summary: '当前页面为“创建账号”，检测到 1 个 ref，forms 暂不支持。',
      counts: {
        refs: 1,
        interactive: 1,
        forms: 0
      },
      highlights: [refItem],
      warnings: ['forms: unsupported']
    });

    expect(parsed.highlights).toHaveLength(1);
    expect(JSON.stringify(parsed)).not.toContain('items');
  });

  it('accepts interactive element tab items and read-only element tool payloads', () => {
    const interactiveElement = interactiveElementSchema.parse({
      refId: 'ref_button',
      role: 'button',
      name: '提交',
      tagName: 'button',
      visible: true,
      disabled: false,
      checked: false,
      selected: false,
      domOrder: 3,
      warnings: []
    });

    expect(interactiveElement.refId).toBe('ref_button');
    expect(interactiveElement.checked).toBe(false);

    const listPayload = interactiveFindPayloadSchema.parse({
      status: 'ready',
      elements: [interactiveElement],
      count: 1,
      warnings: []
    });
    const inspectPayload = elementInspectPayloadSchema.parse({
      element: interactiveElement,
      warnings: []
    });
    const statePayload = elementReadStatePayloadSchema.parse({
      refId: 'ref_button',
      visible: true,
      disabled: false,
      checked: false,
      selected: false,
      warnings: []
    });

    expect(listPayload.elements).toHaveLength(1);
    expect(inspectPayload.element.name).toBe('提交');
    expect(statePayload.refId).toBe('ref_button');
  });

  it('accepts form field snapshots, submit summary, and read-only form tool payloads', () => {
    const disabledReason = disabledSubmitReasonSchema.parse({
      kind: 'inferred',
      message: '必填字段为空，提交按钮处于禁用状态',
      fieldRefId: 'ref_email'
    });
    const submitSummary = formSubmitSummarySchema.parse({
      refId: 'ref_submit',
      disabled: true,
      reason: disabledReason
    });
    const field = formFieldSnapshotSchema.parse({
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
      submit: submitSummary,
      warnings: []
    });

    expect(field.validation.valid).toBe(false);
    expect(field.submit?.reason?.kind).toBe('inferred');

    expect(
      formListPayloadSchema.parse({
        status: 'ready',
        forms: [{ formRefId: 'form_1', fieldCount: 1, submit: submitSummary }],
        count: 1,
        warnings: []
      }).forms[0]?.fieldCount
    ).toBe(1);
    expect(
      formInspectPayloadSchema.parse({
        formRefId: 'form_1',
        fields: [field],
        submit: submitSummary,
        warnings: []
      }).fields
    ).toHaveLength(1);
    expect(
      formReadFieldsPayloadSchema.parse({
        status: 'ready',
        fields: [field],
        count: 1,
        submit: submitSummary,
        warnings: []
      }).fields[0]?.refId
    ).toBe('ref_email');
    expect(
      formFindMissingRequiredPayloadSchema.parse({
        fields: [field],
        count: 1,
        warnings: []
      }).count
    ).toBe(1);
    expect(
      formFindValidationErrorsPayloadSchema.parse({
        fields: [field],
        count: 1,
        warnings: []
      }).count
    ).toBe(1);
    expect(
      formFindDisabledSubmitReasonPayloadSchema.parse({
        submit: submitSummary,
        reason: disabledReason,
        warnings: []
      }).reason.kind
    ).toBe('inferred');
  });
});
