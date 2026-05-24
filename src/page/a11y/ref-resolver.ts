import type { ElementRef } from '../../shared/schemas/observation.schema';
import { readAccessibleName } from './accessible-name';
import { isDisabledElement, isVisibleElement } from './element-finder';
import type { RefMap } from './ref-map';
import { resolveRole } from './role-resolver';

export type ResolveRefResult =
  | {
      ok: true;
      element: ElementRef;
    }
  | {
      ok: false;
      code: 'REF_NOT_FOUND' | 'REF_STALE';
      message: string;
    };

export function resolveRef(refMap: RefMap, refId: string): ResolveRefResult {
  const entry = refMap.resolve(refId);
  if (!entry) {
    return {
      ok: false,
      code: 'REF_NOT_FOUND',
      message: `Ref not found: ${refId}`
    };
  }
  if (refMap.isEntryStale(entry)) {
    return {
      ok: false,
      code: 'REF_STALE',
      message: `Ref is stale: ${refId}`
    };
  }

  return {
    ok: true,
    element: {
      refId,
      role: resolveRole(entry.element),
      name: readAccessibleName(entry.element),
      tagName: entry.element.tagName.toLowerCase(),
      visible: isVisibleElement(entry.element),
      disabled: isDisabledElement(entry.element)
    }
  };
}
