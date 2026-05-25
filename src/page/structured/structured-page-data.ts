import type { Observation } from '../../shared/schemas/observation.schema';
import type {
  InteractiveElement,
  StructuredPageContextSummary,
  StructuredPageData
} from '../../shared/schemas/structured-page-data.schema';
import { EMPTY_STATE_REASONS } from './empty-state-reasons';

export type BuildStructuredPageDataOptions = {
  updatedAt?: string;
};

export type BuildStructuredPageContextSummaryOptions = {
  maxHighlights?: number;
};

export function buildStructuredPageData(
  observation: Observation,
  options: BuildStructuredPageDataOptions = {}
): StructuredPageData {
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const refs = observation.refSummary;
  const forms = readObservationFormFields(observation.formFields);
  const interactiveElements: InteractiveElement[] = refs.map((ref, index) => ({
    ...ref,
    disabled: ref.disabled ?? false,
    checked: readOptionalBoolean(ref, 'checked'),
    selected: readOptionalBoolean(ref, 'selected'),
    domOrder: readOptionalNumber(ref, 'domOrder') ?? index,
    warnings: readWarnings(ref)
  }));
  const hasRefs = refs.length > 0;

  return {
    observation: {
      status: 'ready',
      summary: `当前页面为“${observation.title || observation.url}”`,
      count: 1,
      items: [
        {
          url: observation.url,
          title: observation.title,
          currentDomain: observation.currentDomain,
          origin: observation.origin,
          visibleTextSummary: observation.visibleTextSummary,
          pageStateSummary: observation.pageStateSummary
        }
      ],
      updatedAt,
      warnings: observation.warnings
    },
    refs: {
      status: hasRefs ? 'ready' : 'empty',
      summary: hasRefs ? `检测到 ${refs.length} 个 ref` : '未检测到 ref',
      count: refs.length,
      items: refs,
      updatedAt,
      warnings: [],
      ...(hasRefs ? {} : { emptyReason: EMPTY_STATE_REASONS.NO_REFS_DETECTED })
    },
    interactive: {
      status: hasRefs ? 'ready' : 'empty',
      summary: hasRefs
        ? `检测到 ${interactiveElements.length} 个交互元素`
        : '未检测到交互元素',
      count: interactiveElements.length,
      items: interactiveElements,
      updatedAt,
      warnings: [],
      ...(hasRefs
        ? {}
        : {
            emptyReason: EMPTY_STATE_REASONS.NO_INTERACTIVE_ELEMENTS_DETECTED
          })
    },
    forms: {
      status: forms?.status ?? 'unsupported',
      summary: forms
        ? summarizeForms(forms.fields, forms.submit)
        : '当前观察未包含表单字段数据；请使用 v0.32 表单读取能力获取字段快照',
      count: forms?.fields.length ?? 0,
      items: forms?.fields ?? [],
      updatedAt,
      warnings: forms?.warnings ?? [],
      ...(forms?.emptyReason ? { emptyReason: forms.emptyReason } : {})
    }
  };
}

export function buildStructuredPageContextSummary(
  structured: StructuredPageData,
  options: BuildStructuredPageContextSummaryOptions = {}
): StructuredPageContextSummary {
  const maxHighlights = options.maxHighlights ?? 8;
  const observation = structured.observation.items[0];
  const highlights = structured.refs.items.slice(0, maxHighlights);
  const formSummary =
    structured.forms.status === 'unsupported'
      ? 'forms 暂不支持'
      : structured.forms.summary;

  return {
    url: observation?.url ?? '',
    title: observation?.title ?? '',
    currentDomain: observation?.currentDomain ?? '',
    origin: observation?.origin ?? '',
    summary: [
      observation?.pageStateSummary ?? structured.observation.summary,
      `refs ${structured.refs.count} 个`,
      `interactive ${structured.interactive.count} 个`,
      formSummary
    ].join('；'),
    counts: {
      refs: structured.refs.count,
      interactive: structured.interactive.count,
      forms: structured.forms.count
    },
    highlights,
    warnings: collectStructuredWarnings(structured)
  };
}

function collectStructuredWarnings(structured: StructuredPageData): string[] {
  return [
    ...normalizeWarnings('observation', structured.observation.warnings),
    ...normalizeWarnings('refs', structured.refs.warnings),
    ...normalizeWarnings('interactive', structured.interactive.warnings),
    ...normalizeWarnings('forms', structured.forms.warnings),
    ...(structured.forms.status === 'unsupported' ? ['forms: unsupported'] : [])
  ];
}

function normalizeWarnings(
  tab: string,
  warnings: StructuredPageData['observation']['warnings']
): string[] {
  return warnings.map((warning) =>
    typeof warning === 'string'
      ? `${tab}: ${warning}`
      : `${tab}: ${warning.code}`
  );
}

function readOptionalBoolean(value: unknown, key: string): boolean | undefined {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[key] === 'boolean'
    ? ((value as Record<string, boolean>)[key] ?? undefined)
    : undefined;
}

function readOptionalNumber(value: unknown, key: string): number | undefined {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[key] === 'number'
    ? ((value as Record<string, number>)[key] ?? undefined)
    : undefined;
}

function readWarnings(value: unknown): InteractiveElement['warnings'] {
  if (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Record<string, unknown>).warnings)
  ) {
    return (value as { warnings: InteractiveElement['warnings'] }).warnings;
  }
  return [];
}

type ObservationFormFields = {
  status: 'ready' | 'empty' | 'partial';
  fields: StructuredPageData['forms']['items'];
  submit?: StructuredPageData['forms']['items'][number]['submit'];
  warnings: StructuredPageData['forms']['warnings'];
  emptyReason?: string;
};

function readObservationFormFields(value: unknown): ObservationFormFields | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.fields)) {
    return undefined;
  }
  const status =
    record.status === 'ready' || record.status === 'empty' || record.status === 'partial'
      ? record.status
      : 'partial';
  return {
    status,
    fields: record.fields as ObservationFormFields['fields'],
    submit: record.submit as ObservationFormFields['submit'],
    warnings: Array.isArray(record.warnings)
      ? (record.warnings as ObservationFormFields['warnings'])
      : [],
    ...(typeof record.emptyReason === 'string'
      ? { emptyReason: record.emptyReason }
      : {})
  };
}

function summarizeForms(
  fields: StructuredPageData['forms']['items'],
  submit: ObservationFormFields['submit']
): string {
  const requiredCount = fields.filter((field) => field.required).length;
  const invalidCount = fields.filter((field) => !field.validation.valid).length;
  const submitSummary = submit
    ? `submit ${submit.disabled ? 'disabled' : 'enabled'}`
    : 'submit 未找到';
  return `检测到 ${fields.length} 个字段，必填 ${requiredCount} 个，校验错误 ${invalidCount} 个，${submitSummary}`;
}
