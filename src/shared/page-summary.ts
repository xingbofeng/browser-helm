type PageSummaryInput = {
  title?: string | undefined;
  currentDomain?: string | undefined;
  url?: string | undefined;
  pageStateSummary?: string | undefined;
  interactiveCount?: number | undefined;
  warnings?: string[] | undefined;
};

export function buildUserFacingPageSummary(input: PageSummaryInput): string {
  const title = cleanSummaryPart(input.title);
  const domain = cleanSummaryPart(input.currentDomain) ?? domainFromUrl(input.url);
  const state = cleanSummaryPart(input.pageStateSummary);
  const shouldShowInteractiveCount = typeof input.interactiveCount === 'number' &&
    !state?.includes('可交互元素');
  const lines = [
    title
      ? `当前页面看起来是“${title}”。`
      : '当前页面已完成只读观察。',
    domain ? `来源：${domain}。` : undefined,
    state,
    shouldShowInteractiveCount
      ? `检测到约 ${input.interactiveCount} 个可交互元素。`
      : undefined,
    input.warnings?.length
      ? `需要注意：${input.warnings.map(cleanSummaryPart).filter(Boolean).join('；')}。`
      : undefined
  ];
  return lines.filter(Boolean).join('\n');
}

function cleanSummaryPart(value: string | undefined): string | undefined {
  const trimmed = value?.replace(/\s+/gu, ' ').trim();
  return trimmed || undefined;
}

function domainFromUrl(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? '');
    return url.hostname.replace(/^www\./u, '');
  } catch {
    return undefined;
  }
}
