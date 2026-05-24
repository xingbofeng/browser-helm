export type VisibleTextOptions = {
  maxChars?: number;
};

export type VisibleTextResult = {
  text: string;
  warnings: string[];
};

const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

export function readVisibleText(
  document: Document,
  options: VisibleTextOptions = {}
): VisibleTextResult {
  const maxChars = options.maxChars ?? 1200;
  const text = collectText(document.body ?? document.documentElement)
    .replace(/\s+/gu, ' ')
    .trim();

  if (text.length > maxChars) {
    return {
      text: text.slice(0, maxChars),
      warnings: ['VISIBLE_TEXT_TRUNCATED']
    };
  }

  return {
    text,
    warnings: []
  };
}

function collectText(element: Element | null): string {
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
        return collectText(node as Element);
      }
      return '';
    })
    .join(' ');
}
