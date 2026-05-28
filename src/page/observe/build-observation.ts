import type { Observation } from '../../shared/schemas/observation.schema';
import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { readFormFields } from '../dom/form-reader';
import { readPageHealthSummary } from '../dom/page-health-reader';
import { readPageMetadata } from './page-metadata';
import { readPageState } from './page-state';
import { readVisibleText } from './visible-text';
import type { Locale } from '../../i18n/types';

export type BuildObservationOptions = {
  refMap?: RefMap;
  documentId?: string;
  maxVisibleTextChars?: number;
  locale?: Locale;
};

export function buildObservation(
  document: Document,
  options: BuildObservationOptions = {}
): Observation {
  const metadata = readPageMetadata(document);
  const refMap =
    options.refMap ??
    new RefMap({
      documentId: options.documentId ?? metadata.url,
      origin: metadata.origin
    });
  const visibleTextOptions =
    options.maxVisibleTextChars === undefined
      ? {}
      : { maxChars: options.maxVisibleTextChars };
  const visibleText = readVisibleText(document, visibleTextOptions);
  const pageState = readPageState(document);
  const snapshot = buildA11ySnapshot(document, refMap);
  const locale = options.locale ?? 'zh';
  const formFields = readFormFields(document, refMap, locale);
  const pageHealth = readPageHealthSummary(document, locale);

  return {
    url: metadata.url,
    title: metadata.title,
    currentDomain: metadata.currentDomain,
    origin: metadata.origin,
    visibleText: visibleText.text,
    visibleTextSummary: visibleText.text,
    pageStateSummary: pageState.pageStateSummary,
    refSummary: snapshot.elements,
    formFields,
    pageHealth,
    warnings: [...metadata.warnings, ...visibleText.warnings, ...snapshot.warnings]
  };
}
