import { describe, expect, it } from 'vitest';
import { validateRuntimeToolDecision } from '../../../../src/agent/loop/form-fill-augmenter';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import type { AgentDecision } from '../../../../src/shared/schemas/agent-decision.schema';

function makeRecord(task: string): RunRecord {
  return { task, mode: 'form', trace: [] };
}

function makeSnapshot(fields: Record<string, unknown>[]): RunSnapshot {
  const formsItems = fields.map((f) => ({
    refId: f.refId,
    label: f.label ?? '',
    name: f.name ?? '',
    type: f.type ?? 'text',
    required: (f.required as boolean) ?? false,
    disabled: (f.disabled as boolean) ?? false,
    sensitive: (f.sensitive as boolean) ?? false,
    valuePreview: f.valuePreview ?? 'empty',
    validation: { valid: true },
    writable: {
      visible: true,
      readonly: (f.readonly as boolean) ?? false,
      hidden: (f.hidden as boolean) ?? false,
      isFileUpload: (f.isFileUpload as boolean) ?? false,
      isContentEditable: false,
      honeypotCandidate: false,
      actualTagName: 'input',
      actualValue: f.actualValue ?? ''
    },
    warnings: []
  }));

  // runtimeFormCandidates only reads structuredPageData.forms.items and
  // structuredPageData.interactive.items — use a type assertion for the
  // rest since the full schema is not needed for validation tests.
  return {
    runId: 'test-run-1',
    mode: 'form',
    status: 'thinking',
    observation: undefined,
    structuredPageData: {
      forms: { status: 'ready' as const, summary: 'test', count: formsItems.length,
        updatedAt: new Date().toISOString(), warnings: [], items: formsItems },
      interactive: { status: 'empty' as const, summary: 'empty', count: 0,
        updatedAt: new Date().toISOString(), warnings: [], items: [] },
      refs: { status: 'empty' as const, summary: 'empty', count: 0,
        updatedAt: new Date().toISOString(), warnings: [], items: [] },
      observation: { status: 'empty' as const, summary: 'empty', count: 0,
        updatedAt: new Date().toISOString(), warnings: [], items: [] }
    },
    toolResult: undefined,
    messages: [],
    streaming: { enabled: false, active: false, chunkCount: 0, fallbackUsed: false },
    trace: []
  } as unknown as RunSnapshot;
}

const SNAPSHOT_FIELDS = [
  { refId: 'field-1', label: 'Name', name: 'name', type: 'text', valuePreview: 'empty', actualValue: '' },
  { refId: 'field-2', label: 'Email', name: 'email', type: 'email', valuePreview: 'user@test.com', actualValue: 'user@test.com' },
  { refId: 'field-3', label: 'Password', name: 'password', type: 'password', sensitive: true, valuePreview: 'empty', actualValue: '' },
  { refId: 'field-4', label: 'Hidden', name: 'hidden_field', type: 'hidden', hidden: true, valuePreview: 'empty', actualValue: '' },
  { refId: 'field-5', label: 'Disabled', name: 'disabled_field', type: 'text', disabled: true, valuePreview: 'empty', actualValue: '' },
  { refId: 'field-6', label: 'Readonly', name: 'readonly_field', type: 'text', readonly: true, valuePreview: 'pre-filled', actualValue: 'pre-filled' },
  { refId: 'field-7', label: 'File', name: 'avatar', type: 'file', isFileUpload: true, valuePreview: 'empty', actualValue: '' }
];

describe('validateRuntimeToolDecision', () => {
  // ── FORM_FILL_FIELD validation ──

  it('rejects FORM_FILL_FIELD with a non-existent field refId', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'non-existent', value: 'test' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill name with test'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.code).toBeTruthy();
    expect(rejection!.kind).toBe('blocked');
  });

  it('rejects FORM_FILL_FIELD with a value not in user task', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-1', value: 'invented_value_not_in_task' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill name with John'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.kind).toBe('needs_explicit_form_values');
  });

  it('accepts FORM_FILL_FIELD with a value explicitly in user task', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-1', value: 'John' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill name with John'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeUndefined();
  });

  it('rejects FORM_FILL_FIELD on a sensitive field', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-3', value: 'password123' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill password with password123'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.kind).toBe('blocked');
  });

  it('rejects FORM_FILL_FIELD on a hidden field', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-4', value: 'hidden_value' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill hidden_field with hidden_value'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.kind).toBe('blocked');
  });

  it('rejects FORM_FILL_FIELD on a disabled field', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-5', value: 'value' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill disabled_field with value'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.kind).toBe('blocked');
  });

  it('rejects FORM_FILL_FIELD on a file upload field', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-7', value: 'file.txt' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('upload file.txt'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
    expect(rejection!.kind).toBe('blocked');
  });

  it('rejects FORM_FILL_FIELD overwriting existing value on non-empty field', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_field',
      args: { fieldRefId: 'field-2', value: 'new@test.com' }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('change email to new@test.com'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeDefined();
  });

  // ── FORM_FILL_MANY still works ──

  it('still validates FORM_FILL_MANY (existing behavior)', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_form_fill_many',
      args: { fields: [{ fieldRefId: 'field-1', value: 'John' }] }, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('fill name with John'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeUndefined();
  });

  // ── Non-form-fill tools pass through ──

  it('returns undefined for non-form-fill tools', () => {
    const decision: AgentDecision = {
      type: 'tool_call', tool: 'bh_page_observe', args: {}, reason: 'testing'
    };
    const rejection = validateRuntimeToolDecision(
      makeRecord('observe page'), makeSnapshot(SNAPSHOT_FIELDS), decision
    );
    expect(rejection).toBeUndefined();
  });
});
