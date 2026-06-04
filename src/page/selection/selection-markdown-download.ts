export type SelectionMarkdownDownloadOptions = {
  document: Document;
  markdown: string;
  suggestedFileName: string;
  createObjectUrl?: ((blob: Blob) => string) | undefined;
  revokeObjectUrl?: ((url: string) => void) | undefined;
};

export function downloadSelectionMarkdown(options: SelectionMarkdownDownloadOptions): void {
  const objectUrl = createMarkdownObjectUrl(options);
  const anchor = options.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = options.suggestedFileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  (options.document.body ?? options.document.documentElement).append(anchor);
  anchor.click();
  anchor.remove();
  const revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;
  revokeObjectUrl?.(objectUrl);
}

function createMarkdownObjectUrl(options: SelectionMarkdownDownloadOptions): string {
  const blob = new Blob([options.markdown], { type: 'text/markdown;charset=utf-8' });
  if (options.createObjectUrl) {
    return options.createObjectUrl(blob);
  }
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return `data:text/markdown;charset=utf-8,${encodeURIComponent(options.markdown)}`;
}

function defaultRevokeObjectUrl(url: string): void {
  if (!url.startsWith('blob:') || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
    return;
  }
  URL.revokeObjectURL(url);
}
