export type SelectionMarkdownResult =
  | {
      ok: true;
      markdown: string;
      warnings: string[];
    }
  | {
      ok: false;
      reason: 'empty_selection';
    };

export type SelectionMarkdownOptions = {
  document: Document;
  baseUrl?: string | undefined;
  maxChars?: number | undefined;
};

type FragmentMarkdownOptions = {
  baseUrl?: string | undefined;
  maxChars?: number | undefined;
};

type RenderContext = {
  baseUrl?: string | undefined;
  preserveWhitespace?: boolean | undefined;
};

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'UL'
]);

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);

export function markdownFromSelection(
  selection: Selection | null,
  options: SelectionMarkdownOptions
): SelectionMarkdownResult {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { ok: false, reason: 'empty_selection' };
  }

  const fragment = options.document.createDocumentFragment();
  for (let index = 0; index < selection.rangeCount; index += 1) {
    fragment.append(selection.getRangeAt(index).cloneContents());
  }

  const warnings: string[] = [];
  let markdown = markdownFromSelectionFragment(fragment, {
    baseUrl: options.baseUrl ?? options.document.location?.href,
    maxChars: options.maxChars
  });
  if (!markdown) {
    return { ok: false, reason: 'empty_selection' };
  }
  if (options.maxChars && markdown.length > options.maxChars) {
    markdown = `${markdown.slice(0, options.maxChars).trimEnd()}\n\n<!-- BrowserHelm: selection truncated -->`;
    warnings.push('selection_truncated');
  }
  return { ok: true, markdown, warnings };
}

export function markdownFromSelectionFragment(
  fragment: DocumentFragment,
  options: FragmentMarkdownOptions = {}
): string {
  return normalizeMarkdown(renderChildren(fragment, { baseUrl: options.baseUrl }));
}

function renderChildren(parent: Node, context: RenderContext): string {
  const parts: string[] = [];
  parent.childNodes.forEach((child) => {
    const rendered = renderNode(child, context);
    if (!rendered.trim()) {
      return;
    }
    parts.push(rendered);
  });
  return joinMarkdownParts(parts);
}

function renderInlineChildren(parent: Node, context: RenderContext): string {
  const parts: string[] = [];
  parent.childNodes.forEach((child) => {
    const rendered = renderNode(child, context);
    if (!rendered) {
      return;
    }
    parts.push(rendered);
  });
  return normalizeInline(parts.join(''));
}

function renderNode(node: Node, context: RenderContext): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return context.preserveWhitespace
      ? node.textContent ?? ''
      : normalizeInline(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as Element;
  const tagName = element.tagName.toUpperCase();
  if (shouldSkipElement(element, tagName)) {
    return '';
  }

  if (/^H[1-6]$/u.test(tagName)) {
    const level = Number(tagName.slice(1));
    return `${'#'.repeat(level)} ${renderInlineChildren(element, context)}`.trim();
  }

  switch (tagName) {
    case 'A':
      return renderLink(element, context);
    case 'IMG':
      return renderImage(element, context);
    case 'BR':
      return '\n';
    case 'HR':
      return '---';
    case 'P':
      return renderInlineChildren(element, context);
    case 'STRONG':
    case 'B':
      return wrapInline('**', renderInlineChildren(element, context));
    case 'EM':
    case 'I':
      return wrapInline('*', renderInlineChildren(element, context));
    case 'CODE':
      return renderInlineCode(element);
    case 'PRE':
      return renderCodeBlock(element);
    case 'BLOCKQUOTE':
      return renderBlockquote(element, context);
    case 'UL':
      return renderList(element, context, false);
    case 'OL':
      return renderList(element, context, true);
    case 'TABLE':
      return renderTable(element, context);
    default:
      return BLOCK_TAGS.has(tagName)
        ? renderChildren(element, context)
        : renderInlineChildren(element, context);
  }
}

function renderLink(element: Element, context: RenderContext): string {
  const text = renderInlineChildren(element, context) || element.getAttribute('href') || '';
  const href = resolveUrl(element.getAttribute('href'), context.baseUrl);
  return href ? `[${escapeLinkText(text)}](${href})` : text;
}

function renderImage(element: Element, context: RenderContext): string {
  const alt = element.getAttribute('alt')?.trim() ?? '';
  const src = resolveUrl(element.getAttribute('src'), context.baseUrl);
  return src ? `![${escapeLinkText(alt)}](${src})` : '';
}

function renderInlineCode(element: Element): string {
  const text = normalizeInline(element.textContent ?? '');
  if (!text) {
    return '';
  }
  const fence = text.includes('`') ? '``' : '`';
  return `${fence}${text}${fence}`;
}

function renderCodeBlock(element: Element): string {
  const text = (element.textContent ?? '').replace(/\n+$/u, '');
  if (!text.trim()) {
    return '';
  }
  return `\`\`\`\n${text}\n\`\`\``;
}

function renderBlockquote(element: Element, context: RenderContext): string {
  const body = normalizeMarkdown(renderChildren(element, context));
  return body
    .split('\n')
    .map((line) => line ? `> ${line}` : '>')
    .join('\n');
}

function renderList(element: Element, context: RenderContext, ordered: boolean): string {
  const items = Array.from(element.children).filter((child) => child.tagName.toUpperCase() === 'LI');
  return items
    .map((item, index) => {
      const marker = ordered ? `${index + 1}.` : '-';
      const body = renderChildren(item, context) || renderInlineChildren(item, context);
      const lines = normalizeMarkdown(body).split('\n');
      const [first = '', ...rest] = lines;
      const continuationIndent = ' '.repeat(marker.length + 1);
      return [
        `${marker} ${first}`,
        ...rest.map((line) => `${continuationIndent}${line}`)
      ].join('\n').trimEnd();
    })
    .filter(Boolean)
    .join('\n');
}

function renderTable(element: Element, context: RenderContext): string {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map((row) => Array.from(row.children)
      .filter((cell) => {
        const tagName = cell.tagName.toUpperCase();
        return tagName === 'TH' || tagName === 'TD';
      })
      .map((cell) => escapeTableCell(renderInlineChildren(cell, context))))
    .filter((row) => row.length > 0);
  if (rows.length === 0) {
    return '';
  }

  const [header = [], ...body] = rows;
  const separator = header.map(() => '---');
  return [header, separator, ...body]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function shouldSkipElement(element: Element, tagName: string): boolean {
  if (SKIPPED_TAGS.has(tagName)) {
    return true;
  }
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return /display\s*:\s*none/u.test(style) || /visibility\s*:\s*hidden/u.test(style);
}

function resolveUrl(rawUrl: string | null, baseUrl: string | undefined): string {
  if (!rawUrl?.trim()) {
    return '';
  }
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return rawUrl;
  }
}

function wrapInline(marker: string, text: string): string {
  return text ? `${marker}${text}${marker}` : '';
}

function joinMarkdownParts(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function normalizeInline(text: string): string {
  return text.replace(/\s+/gu, ' ');
}

function escapeLinkText(text: string): string {
  return text.replace(/\]/gu, '\\]');
}

function escapeTableCell(text: string): string {
  return text.replace(/\|/gu, '\\|').replace(/\n+/gu, '<br>');
}
