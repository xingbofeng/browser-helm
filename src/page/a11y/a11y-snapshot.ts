import type { A11ySnapshot } from '../../shared/schemas/observation.schema';
import { readPageMetadata } from '../observe/page-metadata';
import { readAccessibleName } from './accessible-name';
import {
  findInteractiveCandidates,
  isDisabledElement,
  isVisibleElement
} from './element-finder';
import type { RefMap } from './ref-map';
import { resolveRole } from './role-resolver';

export function buildA11ySnapshot(
  document: Document,
  refMap: RefMap
): A11ySnapshot {
  const metadata = readPageMetadata(document);
  const elements = findInteractiveCandidates(document).map((element) =>
    refMap.register(element, {
      role: resolveRole(element),
      name: readAccessibleName(element),
      tagName: element.tagName.toLowerCase(),
      visible: isVisibleElement(element),
      disabled: isDisabledElement(element)
    })
  );

  return {
    url: metadata.url,
    origin: metadata.origin,
    currentDomain: metadata.currentDomain,
    elements,
    warnings: []
  };
}
