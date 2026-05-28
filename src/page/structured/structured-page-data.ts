import { classifyZone, type PageZone } from '../a11y/interactive-ranker';
import type { Observation } from '../../shared/schemas/observation.schema';
import type {
  InteractiveElement,
  StructuredPageContextSummary,
  StructuredPageData
} from '../../shared/schemas/structured-page-data.schema';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import { EMPTY_STATE_REASONS } from './empty-state-reasons';

export type BuildStructuredPageDataOptions = {
  updatedAt?: string;
  locale?: Locale;
};

export type BuildStructuredPageContextSummaryOptions = {
  maxHighlights?: number;
  locale?: Locale;
};

export function buildStructuredPageData(
  observation: Observation,
  options: BuildStructuredPageDataOptions = {}
): StructuredPageData {
  const locale = options.locale ?? 'zh';
  const updatedAt = options.updatedAt ?? new Date().toISOString();
  const refs = observation.refSummary;
  const forms = readObservationFormFields(observation.formFields);
  const interactiveElements: InteractiveElement[] = refs.map((ref, index) => ({
    ...ref,
    disabled: ref.disabled ?? false,
    checked: readOptionalBoolean(ref, 'checked'),
    selected: readOptionalBoolean(ref, 'selected'),
    domOrder: readOptionalNumber(ref, 'domOrder') ?? index,
    pageZone: ref.pageZone,
    warnings: readWarnings(ref)
  }));
  const hasRefs = refs.length > 0;

  return {
    observation: {
      status: 'ready',
      summary: t('page.structured.currentPage', locale, { title: observation.title || observation.url }),
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
      summary: hasRefs
        ? t('page.structured.refsDetected', locale, { count: String(refs.length) })
        : t('page.structured.noRefs', locale),
      count: refs.length,
      items: refs,
      updatedAt,
      warnings: [],
      ...(hasRefs ? {} : { emptyReason: EMPTY_STATE_REASONS.NO_REFS_DETECTED })
    },
    interactive: {
      status: hasRefs ? 'ready' : 'empty',
      summary: hasRefs
        ? t('page.structured.interactiveDetected', locale, { count: String(interactiveElements.length) })
        : t('page.structured.noInteractive', locale),
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
        ? summarizeForms(forms.fields, forms.submit, locale)
        : t('page.structured.formsUnavailable', locale),
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
  const locale = options.locale ?? 'zh';
  const maxHighlights = options.maxHighlights ?? 8;
  const observation = structured.observation.items[0];
  const highlights = structured.refs.items.slice(0, maxHighlights);
  const formSummary =
    structured.forms.status === 'unsupported'
      ? t('page.structured.formsUnsupported', locale)
      : structured.forms.summary;

  const zoneDistribution = summarizeZoneDistribution(structured.refs.items, locale);

  return {
    url: observation?.url ?? '',
    title: observation?.title ?? '',
    currentDomain: observation?.currentDomain ?? '',
    origin: observation?.origin ?? '',
    summary: [
      observation?.pageStateSummary ?? structured.observation.summary,
      zoneDistribution,
      t('page.structured.refsCount', locale, { count: String(structured.refs.count) }),
      t('page.structured.interactiveCount', locale, { count: String(structured.interactive.count) }),
      formSummary
    ].filter(Boolean).join('；'),
    counts: {
      refs: structured.refs.count,
      interactive: structured.interactive.count,
      forms: structured.forms.count
    },
    highlights,
    warnings: collectStructuredWarnings(structured)
  };
}

function summarizeZoneDistribution(refs: StructuredPageData['refs']['items'], locale: Locale): string {
  const counts = new Map<PageZone, number>();
  counts.set('nav', 0);
  counts.set('form', 0);
  counts.set('content', 0);
  counts.set('other', 0);
  for (const ref of refs) {
    const zone = classifyZone(ref);
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  const parts: string[] = [];
  const zoneLabels: Record<PageZone, string> = {
    nav: t('page.zone.nav', locale),
    form: t('page.zone.form', locale),
    content: t('page.zone.content', locale),
    other: t('page.zone.other', locale)
  };
  for (const zone of ['nav', 'form', 'content', 'other'] as PageZone[]) {
    const count = counts.get(zone) ?? 0;
    if (count > 0) {
      parts.push(`${zoneLabels[zone]} ${count}`);
    }
  }
  return parts.length > 0 ? parts.join(' | ') : '';
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
  submit: ObservationFormFields['submit'],
  locale: Locale
): string {
  const requiredCount = fields.filter((field) => field.required).length;
  const invalidCount = fields.filter((field) => !field.validation.valid).length;
  const submitSummary = submit
    ? t('page.structured.submitStatus', locale, { status: submit.disabled ? 'disabled' : 'enabled' })
    : t('page.structured.submitNotFound', locale);
  return t('page.structured.formFieldsSummary', locale, {
    total: String(fields.length),
    required: String(requiredCount),
    invalid: String(invalidCount),
    submitSummary
  });
}
