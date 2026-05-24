import type { Observation } from '../../shared/schemas/observation.schema';
import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { readFormFields } from '../dom/form-reader';
import { readPageMetadata } from './page-metadata';
import { readPageState } from './page-state';
import { readVisibleText } from './visible-text';

export type BuildObservationOptions = {
  refMap?: RefMap;
  documentId?: string;
  maxVisibleTextChars?: number;
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
  const formFields = readFormFields(document, refMap);

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
    warnings: [...metadata.warnings, ...visibleText.warnings, ...snapshot.warnings]
  };
}
