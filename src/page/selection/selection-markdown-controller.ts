import {
  markdownFromSelection,
  type SelectionMarkdownResult
} from './selection-markdown';
import {
  downloadSelectionMarkdown,
  type SelectionMarkdownDownloadOptions
} from './selection-markdown-download';

export type PreviewCurrentSelectionOptions = {
  document: Document;
  selection: Selection | null;
  baseUrl?: string | undefined;
  now?: (() => Date) | undefined;
  downloadMarkdown?: ((options: SelectionMarkdownDownloadOptions) => void) | undefined;
};

export type PreviewCurrentSelectionResult =
  | {
      ok: true;
      markdownLength: number;
      warnings?: string[] | undefined;
    }
  | Extract<SelectionMarkdownResult, { ok: false }>;

const DEFAULT_MAX_MARKDOWN_CHARS = 200_000;

export function downloadCurrentSelectionAsMarkdown(
  options: PreviewCurrentSelectionOptions
): PreviewCurrentSelectionResult {
  const result = markdownFromSelection(options.selection, {
    document: options.document,
    baseUrl: options.baseUrl ?? options.document.location?.href,
    maxChars: DEFAULT_MAX_MARKDOWN_CHARS
  });
  if (!result.ok) {
    return result;
  }

  const downloadMarkdown = options.downloadMarkdown ?? downloadSelectionMarkdown;
  downloadMarkdown({
    document: options.document,
    markdown: result.markdown,
    suggestedFileName: selectionMarkdownFileName(options.now?.() ?? new Date())
  });

  return {
    ok: true,
    markdownLength: result.markdown.length,
    ...(result.warnings.length > 0 ? { warnings: result.warnings } : {})
  };
}

function selectionMarkdownFileName(now: Date): string {
  const date = Number.isNaN(now.getTime())
    ? 'selection'
    : now.toISOString().slice(0, 10);
  return `browserhelm-selection-${date}.md`;
}
