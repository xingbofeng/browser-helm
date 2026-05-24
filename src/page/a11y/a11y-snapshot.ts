import type { A11ySnapshot } from '../../shared/schemas/observation.schema';
import { readPageMetadata } from '../observe/page-metadata';
import { findInteractiveElements } from './interactive-filter';
import { rankInteractiveElements } from './interactive-ranker';
import type { RefMap } from './ref-map';

export function buildA11ySnapshot(
  document: Document,
  refMap: RefMap
): A11ySnapshot {
  const metadata = readPageMetadata(document);
  const elements = rankInteractiveElements(findInteractiveElements(document, refMap));

  return {
    url: metadata.url,
    origin: metadata.origin,
    currentDomain: metadata.currentDomain,
    elements,
    warnings: []
  };
}
