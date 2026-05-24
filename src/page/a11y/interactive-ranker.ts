import type { InteractiveElement } from '../../shared/schemas/structured-page-data.schema';

export function rankInteractiveElements(
  elements: InteractiveElement[]
): InteractiveElement[] {
  return [...elements].sort(compareInteractiveElements);
}

function compareInteractiveElements(
  left: InteractiveElement,
  right: InteractiveElement
): number {
  return (
    scoreVisibility(right) - scoreVisibility(left) ||
    scoreEnabled(right) - scoreEnabled(left) ||
    (left.domOrder ?? Number.MAX_SAFE_INTEGER) -
      (right.domOrder ?? Number.MAX_SAFE_INTEGER) ||
    left.refId.localeCompare(right.refId)
  );
}

function scoreVisibility(element: InteractiveElement): number {
  return element.visible ? 1 : 0;
}

function scoreEnabled(element: InteractiveElement): number {
  return element.disabled ? 0 : 1;
}
