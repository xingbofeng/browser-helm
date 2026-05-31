export type PageReadOptions = {
  cursor?: number | undefined;
  maxChars?: number | undefined;
  source: 'visible_text' | 'article';
  includeHeadings?: boolean | undefined;
  includeLinks?: boolean | undefined;
  linkLimit?: number | undefined;
};

const READ_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

export function readPagedDocumentText(document: Document, options: PageReadOptions) {
  const root = options.source === 'article'
    ? findArticleRoot(document)
    : document.body ?? document.documentElement;
  const rawText = collectReadableText(root).replace(/\s+/gu, ' ').trim();
  const cursor = options.cursor ?? 0;
  const maxChars = options.maxChars ?? 8_000;
  const text = rawText.slice(cursor, cursor + maxChars);
  const nextCursor = cursor + text.length < rawText.length ? cursor + text.length : undefined;
  const headings = options.includeHeadings
    ? readHeadings(root)
    : undefined;
  const links = options.includeLinks
    ? readLinks(root, options.linkLimit ?? 30)
    : undefined;

  return {
    text,
    cursor,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    hasMore: nextCursor !== undefined,
    totalTextLength: rawText.length,
    warnings: nextCursor === undefined ? [] : ['VISIBLE_TEXT_TRUNCATED'],
    contentSource: options.source,
    ...(headings === undefined ? {} : { headings }),
    ...(links === undefined ? {} : { links })
  };
}

function readHeadings(root: Element) {
  return Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6'))
    .slice(0, 40)
    .map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: normalizeText(heading.textContent)
    }))
    .filter((heading) => heading.text.length > 0);
}

function readLinks(root: Element, limit: number) {
  return Array.from(root.querySelectorAll('a[href]'))
    .slice(0, limit)
    .map((link) => ({
      text: normalizeText(link.textContent),
      href: (link as HTMLAnchorElement).href
    }))
    .filter((link) => link.text.length > 0 || link.href.length > 0);
}

function findArticleRoot(document: Document): Element {
  return document.querySelector('article, main, [role="main"], .article, .post, .content, #content')
    ?? document.body
    ?? document.documentElement;
}

function collectReadableText(element: Element | null): string {
  if (!element || READ_SKIP_TAGS.has(element.tagName.toLowerCase()) || isElementHidden(element)) {
    return '';
  }
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType === node.ELEMENT_NODE) {
      return collectReadableText(node as Element);
    }
    return '';
  }).join(' ');
}

function isElementHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return style.includes('display: none') || style.includes('visibility: hidden');
}

function normalizeText(value: string | null): string {
  return (value ?? '').replace(/\s+/gu, ' ').trim();
}
