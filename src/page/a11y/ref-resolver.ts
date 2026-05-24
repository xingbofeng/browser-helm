import { ERROR_CODES } from '../../shared/constants/error-codes';
import { readAccessibleName } from './accessible-name';
import { readElementState } from './element-state-reader';
import type { RefMap } from './ref-map';
import { resolveRole } from './role-resolver';
import { isSensitiveField } from '../dom/sensitive-field';

export type ResolvedRefElement = {
  refId: string;
  role?: string | undefined;
  name?: string | undefined;
  tagName: string;
  visible: boolean;
  disabled: boolean;
  checked?: boolean | undefined;
  selected?: boolean | undefined;
  inputType?: string | undefined;
  autocomplete?: string | undefined;
  isSensitive?: boolean | undefined;
  warnings?: Array<{ code: string; message: string }>;
};

export type ResolveRefResult =
  | {
      ok: true;
      element: ResolvedRefElement;
    }
  | {
      ok: false;
      code: typeof ERROR_CODES.REF_NOT_FOUND | typeof ERROR_CODES.REF_STALE;
      message: string;
    };

export function resolveRef(refMap: RefMap, refId: string): ResolveRefResult {
  const entry = refMap.resolve(refId);
  if (!entry) {
    return {
      ok: false,
      code: ERROR_CODES.REF_NOT_FOUND,
      message: `Ref not found: ${refId}`
    };
  }
  if (refMap.isEntryStale(entry)) {
    return {
      ok: false,
      code: ERROR_CODES.REF_STALE,
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
      ...readResolvedState(entry.element),
      ...readInputMetadata(entry.element)
    }
  };
}

function readResolvedState(element: Element) {
  const state = readElementState(element);
  return {
    visible: state.visible,
    disabled: state.disabled,
    checked: state.checked,
    selected: state.selected,
    warnings: state.warnings
  };
}

function readInputMetadata(element: Element) {
  if (!(element instanceof HTMLElement)) {
    return {};
  }
  return {
    inputType: element.getAttribute('type')?.trim().toLowerCase() || undefined,
    autocomplete: element.getAttribute('autocomplete')?.trim().toLowerCase() || undefined,
    isSensitive: isSensitiveField(element)
  };
}
