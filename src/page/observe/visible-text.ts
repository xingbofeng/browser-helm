export type VisibleTextOptions = {
  maxChars?: number;
};

export type VisibleTextResult = {
  text: string;
  warnings: string[];
};

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

const LANDMARK_TAGS = new Set([
  'header', 'nav', 'main', 'footer', 'section', 'article', 'aside', 'form'
]);
const LANDMARK_SELECTOR = [...LANDMARK_TAGS].join(',');

export function readVisibleText(
  document: Document,
  options: VisibleTextOptions = {}
): VisibleTextResult {
  const maxChars = options.maxChars ?? 1200;
  const root = document.body ?? document.documentElement;

  const landmarks = findLandmarks(root);

  if (landmarks.length === 0) {
    const text = collectAllText(root).replace(/\s+/gu, ' ').trim();
    if (text.length > maxChars) {
      return {
        text: text.slice(0, maxChars),
        warnings: ['VISIBLE_TEXT_TRUNCATED']
      };
    }
    return { text, warnings: [] };
  }

  const parts: string[] = [];
  const warnings = new Set<string>();

  const landmarkSet = new Set(landmarks);
  const bodyRemainder = collectTextOutsideLandmarks(root, landmarkSet)
    .replace(/\s+/gu, ' ')
    .trim();
  const segmentTexts = [
    ...landmarks
      .filter(isPrimaryTextLandmark)
      .map((landmark) => collectAllText(landmark).replace(/\s+/gu, ' ').trim()),
    bodyRemainder,
    ...landmarks
      .filter((landmark) => !isPrimaryTextLandmark(landmark))
      .map((landmark) => collectAllText(landmark).replace(/\s+/gu, ' ').trim())
  ].filter(Boolean);
  const segmentCount = Math.max(1, segmentTexts.length);

  for (const raw of segmentTexts) {
    if (!raw) {
      continue;
    }
    const chunkSize = Math.max(60, Math.min(180, Math.floor(maxChars / segmentCount)));
    const truncated = raw.slice(0, chunkSize);
    if (truncated.length < raw.length) {
      warnings.add('VISIBLE_TEXT_TRUNCATED');
    }
    parts.push(truncated.length < raw.length ? `${truncated}…` : truncated);
  }

  const joinedText = parts.join(' | ');
  const text = joinedText.slice(0, maxChars);
  if (text.length < joinedText.length) {
    warnings.add('VISIBLE_TEXT_TRUNCATED');
  }
  return {
    text,
    warnings: [...warnings]
  };
}

function isPrimaryTextLandmark(element: Element): boolean {
  return ['main', 'article', 'section', 'form'].includes(element.tagName.toLowerCase());
}

function findLandmarks(root: Element): Element[] {
  const landmarks: Element[] = [];
  const visited = new Set<Element>();

  for (const element of root.querySelectorAll(LANDMARK_SELECTOR)) {
    if (
      visited.has(element) ||
      isHidden(element) ||
      isInsideLandmark(element, landmarks)
    ) {
      continue;
    }
    landmarks.push(element);
    visited.add(element);
  }

  return landmarks;
}

function isInsideLandmark(element: Element, existingLandmarks: Element[]): boolean {
  for (const landmark of existingLandmarks) {
    if (landmark.contains(element) && landmark !== element) {
      return true;
    }
  }
  return false;
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return /display\s*:\s*none/u.test(style);
}

function collectAllText(element: Element | null): string {
  if (!element) {
    return '';
  }
  if (SKIP_TAGS.has(element.tagName.toLowerCase())) {
    return '';
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  if (element.hasAttribute('hidden') || style.includes('display: none')) {
    return '';
  }
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === node.TEXT_NODE) {
        return node.textContent ?? '';
      }
      if (node.nodeType === node.ELEMENT_NODE) {
        return collectAllText(node as Element);
      }
      return '';
    })
    .join(' ');
}

function collectTextOutsideLandmarks(element: Element | null, landmarks: Set<Element>): string {
  if (!element) {
    return '';
  }
  if (landmarks.has(element)) {
    return '';
  }
  if (SKIP_TAGS.has(element.tagName.toLowerCase())) {
    return '';
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  if (element.hasAttribute('hidden') || style.includes('display: none')) {
    return '';
  }
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === node.TEXT_NODE) {
        return node.textContent ?? '';
      }
      if (node.nodeType === node.ELEMENT_NODE) {
        return collectTextOutsideLandmarks(node as Element, landmarks);
      }
      return '';
    })
    .join(' ');
}
