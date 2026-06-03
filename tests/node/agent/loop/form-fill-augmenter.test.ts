import { describe, it, expect } from 'vitest';
import {
  validateRuntimeToolDecision,
  normalizeUserText
} from '../../../../src/agent/loop/form-fill-augmenter';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

function makeRunRecord(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    task: '在姓名栏填写张三，在邮箱栏填写test@example.com',
    mode: 'form',
    trace: [],
    ...overrides
  };
}

function makeSnapshot(forms: Array<{
  refId: string;
  label?: string;
  name?: string;
  type?: string;
  valuePreview?: string;
  disabled?: boolean;
  sensitive?: boolean;
  readonly?: boolean;
}> = []): RunSnapshot {
  return {
    runId: 'run-1',
    status: 'running',
    stepIndex: 1,
    task: '在姓名栏填写张三',
    mode: 'form',
    structuredPageData: {
      forms: {
        items: forms.map((f) => ({
          refId: f.refId,
          label: f.label,
          name: f.name ?? f.label,
          type: f.type ?? 'text',
          required: false,
          disabled: f.disabled ?? false,
          sensitive: f.sensitive ?? false,
          valuePreview: f.valuePreview ?? 'empty',
          validation: { valid: true },
          writable: {
            visible: true,
            readonly: f.readonly ?? false,
            hidden: false,
            isFileUpload: f.type === 'file',
            isContentEditable: false,
            honeypotCandidate: false,
            actualTagName: f.type === 'select' ? 'select' : 'input',
            actualValue: ''
          },
          warnings: []
        })),
        summary: `${forms.length} fields`
      },
      observation: { items: [], summary: '' },
      interactive: { items: [], summary: '' },
      refs: []
    },
    trace: [],
    capabilities: { debugger: false, downloads: false, clipboard: false, shallowDebug: false }
  } as unknown as RunSnapshot;
}

describe('validateRuntimeToolDecision', () => {
  it('skips pre-validation when stale ref cannot be uniquely resolved (multiple candidates)', () => {
    const record = makeRunRecord();
    // Two candidates, one stale ref — can't uniquely match, so skip validation
    const snapshot = makeSnapshot([
      { refId: 'ref_2', label: '姓名', name: 'name' },
      { refId: 'ref_3', label: '邮箱', name: 'email' }
    ]);

    // ref_1 is stale, 2 unmatched candidates → skip validation, let content-side resolve
    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [
          { fieldRefId: 'ref_1', value: '张三' }
        ]
      }
    });

    // Returns undefined because stale ref resolution is delegated to content-side
    expect(result).toBeUndefined();
  });

  it('returns undefined (accepts) when field ref is not in current observation but label matches', () => {
    const record = makeRunRecord({ task: '在姓名栏填写张三，在邮箱栏填写test@example.com' });
    const snapshot = makeSnapshot([
      { refId: 'ref_2', label: '姓名', name: 'fullName' },
      { refId: 'ref_3', label: '邮箱', name: 'email' }
    ]);

    // Model uses ref_1 (stale), but '姓名' field now has ref_2
    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_MANY,
      args: {
        fields: [
          { fieldRefId: 'ref_1', value: '张三' },
          { fieldRefId: 'ref_3', value: 'test@example.com' }
        ]
      }
    });

    // Should NOT reject — stale ref_1 should be resolved to ref_2 by label match
    expect(result).toBeUndefined();
  });

  it('returns undefined when field ref is not in current observation but name matches', () => {
    const record = makeRunRecord({ task: '填写邮箱test@example.com' });
    const snapshot = makeSnapshot([
      { refId: 'ref_5', label: '电子邮箱', name: 'email' }
    ]);

    // Model uses ref_1 (stale), but 'email' name field now has ref_5
    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: 'ref_1',
        value: 'test@example.com'
      }
    });

    expect(result).toBeUndefined();
  });

  it('still rejects if label/name match exists but value is not in user task', () => {
    const record = makeRunRecord({ task: '在姓名栏填写张三' });
    const snapshot = makeSnapshot([
      { refId: 'ref_2', label: '姓名', name: 'fullName' }
    ]);

    // ref_1 is stale but matches to ref_2 ('姓名'). However value 'hacker_value' is not in task
    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: 'ref_1',
        value: 'hacker_value'
      }
    });

    expect(result).toBeDefined();
    expect(result!.message).toContain('explicit value');
  });

  it('still rejects sensitive fields even after ref resolution', () => {
    const record = makeRunRecord({ task: '填写密码 mysecretpass' });
    const snapshot = makeSnapshot([
      { refId: 'ref_2', label: '密码', name: 'password', sensitive: true }
    ]);

    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: 'ref_1',
        value: 'mysecretpass'
      }
    });

    expect(result).toBeDefined();
    expect(result!.message).toContain('sensitive');
  });

  it('resolves stale ref for single field fill (FORM_FILL_FIELD)', () => {
    const record = makeRunRecord({ task: '填写手机号13800138000' });
    const snapshot = makeSnapshot([
      { refId: 'ref_99', label: '手机号码', name: 'phone' }
    ]);

    const result = validateRuntimeToolDecision(record, snapshot, {
      type: 'tool_call',
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: 'ref_stale',
        value: '13800138000'
      }
    });

    expect(result).toBeUndefined();
  });
});

describe('normalizeUserText', () => {
  it('lowercases and strips quotes', () => {
    expect(normalizeUserText('"张三"')).toBe('张三');
    expect(normalizeUserText("O'Brien")).toBe("obrien");
  });

  it('normalizes whitespace', () => {
    expect(normalizeUserText('  张  三  ')).toBe('张 三');
  });
});
