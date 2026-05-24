export type PageMetadata = {
  url: string;
  title: string;
  currentDomain: string;
  origin: string;
  warnings: string[];
};

export function readPageMetadata(document: Document): PageMetadata {
  const url = document.defaultView?.location.href ?? document.location?.href ?? '';
  const title = document.title;

  try {
    const parsed = new URL(url);
    return {
      url,
      title,
      currentDomain: parsed.hostname,
      origin: parsed.origin,
      warnings: []
    };
  } catch {
    return {
      url,
      title,
      currentDomain: 'unknown',
      origin: 'unknown',
      warnings: ['URL_PARSE_FAILED']
    };
  }
}
