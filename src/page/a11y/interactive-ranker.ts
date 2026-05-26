import type { InteractiveElement } from '../../shared/schemas/structured-page-data.schema';

export type PageZone = 'nav' | 'form' | 'content' | 'other';

type ClassifiableElement = {
  readonly role?: string | undefined;
  readonly name?: string | undefined;
  readonly tagName: string;
  readonly pageZone?: PageZone | undefined;
};

const ZONE_ORDER: PageZone[] = ['nav', 'form', 'content', 'other'];

export function classifyZone(element: ClassifiableElement): PageZone {
  if (element.pageZone) {
    return element.pageZone;
  }
  const role = element.role ?? '';
  const tagName = element.tagName.toLowerCase();
  const name = (element.name ?? '').toLowerCase();

  if (role === 'link' || role === 'navigation' || role === 'menubar' || role === 'menuitem') {
    return 'nav';
  }
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return 'form';
  }
  if (
    (role === 'button' || tagName === 'button') &&
    /submit|save|cancel|reset|登录|注册|提交|保存|取消|搜索|登出|sign\s?in|log\s?in|sign\s?up|log\s?out/i.test(name)
  ) {
    return 'form';
  }
  if (role === 'heading' || role === 'banner' || role === 'contentinfo') {
    return 'other';
  }
  return 'content';
}

export function rankInteractiveElements(
  elements: InteractiveElement[]
): InteractiveElement[] {
  if (elements.length <= 2) {
    return [...elements].sort(compareInteractiveElements);
  }

  const zones = groupByZone(elements);
  return interleaveZones(zones);
}

function groupByZone(elements: InteractiveElement[]): Map<PageZone, InteractiveElement[]> {
  const zones = new Map<PageZone, InteractiveElement[]>();
  for (const zone of ZONE_ORDER) {
    zones.set(zone, []);
  }
  for (const element of elements) {
    const zone = classifyZone(element);
    zones.get(zone)?.push(element);
  }
  for (const zone of ZONE_ORDER) {
    zones.get(zone)?.sort(compareInteractiveElements);
  }
  return zones;
}

function interleaveZones(zones: Map<PageZone, InteractiveElement[]>): InteractiveElement[] {
  const result: InteractiveElement[] = [];
  const indices = new Map<PageZone, number>();
  const total = [...zones.values()].reduce((sum, group) => sum + group.length, 0);

  while (result.length < total) {
    let added = false;
    for (const zone of ZONE_ORDER) {
      const group = zones.get(zone);
      if (!group) continue;
      const index = indices.get(zone) ?? 0;
      if (index >= group.length) continue;
      const item = group[index];
      result.push(item!);
      indices.set(zone, index + 1);
      added = true;
    }
    if (!added) {
      break;
    }
  }

  return result;
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
