import type { RunSnapshot } from '../../../../runtime/runtime-messages';

export function providerPrompt(task: string, snapshot: RunSnapshot): string {
  const observation = snapshot.observation;
  const summary = [
    `用户任务：${task}`,
    observation
      ? `当前页面：${observation.title} (来源：${providerPageSource(observation)})`
      : '当前页面：尚未获得页面摘要',
    observation?.visibleTextSummary
      ? `页面摘要：${observation.visibleTextSummary}`
      : undefined,
    observation?.pageStateSummary
      ? `页面状态：${observation.pageStateSummary}`
      : undefined,
    typeof observation?.interactiveCount === 'number'
      ? `可交互元素数量：${observation.interactiveCount}`
      : undefined,
    snapshot.structuredPageData?.forms.summary
      ? `表单摘要：${snapshot.structuredPageData.forms.summary}`
      : undefined,
    snapshot.structuredPageData?.interactive.summary
      ? `交互摘要：${snapshot.structuredPageData.interactive.summary}`
      : undefined,
    snapshot.toolResult
      ? `工具结果：${snapshot.toolResult.tool} ${snapshot.toolResult.ok ? '成功' : '失败'}，${snapshot.toolResult.summary}`
      : undefined,
    longPageText(snapshot)
      ? `补充读取的页面正文：\n${longPageText(snapshot)}`
      : undefined
  ].filter(Boolean).join('\n');
  return `${summary}\n\n请基于这些信息给出面向真实用户的简短回答。`;
}

export function providerLabel(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./u, '');
  } catch {
    return 'openai-compatible';
  }
}

function providerPageSource(observation: NonNullable<RunSnapshot['observation']>): string {
  if (observation.currentDomain) {
    return observation.currentDomain;
  }
  try {
    return new URL(observation.url).hostname.replace(/^www\./u, '');
  } catch {
    return observation.origin || 'unknown';
  }
}

function longPageText(snapshot: RunSnapshot): string | undefined {
  if (snapshot.toolResult?.tool !== 'bh_page_read_article' || !snapshot.toolResult.ok) {
    return undefined;
  }
  const detail = snapshot.toolResult.detail;
  if (!detail || typeof detail !== 'object') {
    return undefined;
  }
  const data = (detail as { data?: unknown }).data;
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const text = (data as { text?: unknown }).text;
  return typeof text === 'string' && text.trim() ? text.slice(0, 36_000) : undefined;
}
