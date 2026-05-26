import { useMemo } from 'react';
import { Marked } from 'marked';

const markdownParser = new Marked({ breaks: true });

type StreamingMarkdownProps = {
  content: string;
  className?: string;
};

export function StreamingMarkdown({ content, className }: StreamingMarkdownProps) {
  const html = useMemo(() => sanitizeMarkdownHtml(markdownParser.parse(content) as string), [content]);

  if (!content) {
    return null;
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const allowedTags = new Set([
  'A',
  'BLOCKQUOTE',
  'BR',
  'CODE',
  'EM',
  'LI',
  'OL',
  'P',
  'PRE',
  'STRONG',
  'UL'
]);

function sanitizeMarkdownHtml(html: string): string {
  if (typeof document === 'undefined') {
    return escapeHtml(html);
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeNode(template.content);
  return template.innerHTML;
}

function sanitizeNode(parent: ParentNode): void {
  for (const node of [...parent.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      sanitizeElement(node as Element);
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE) {
      node.remove();
    }
  }
}

function sanitizeElement(element: Element): void {
  if (!allowedTags.has(element.tagName)) {
    element.replaceWith(document.createTextNode(element.textContent ?? ''));
    return;
  }

  const href = element.tagName === 'A' ? element.getAttribute('href') ?? '' : '';
  for (const attribute of [...element.attributes]) {
    element.removeAttribute(attribute.name);
  }

  if (element.tagName === 'A') {
    if (isSafeHref(href)) {
      element.setAttribute('href', href);
      element.setAttribute('rel', 'noreferrer noopener');
      element.setAttribute('target', '_blank');
    }
  }

  sanitizeNode(element);
}

function isSafeHref(href: string): boolean {
  try {
    const parsed = new URL(href, 'https://browserhelm.local');
    return parsed.protocol === 'https:' ||
      parsed.protocol === 'http:' ||
      parsed.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}
