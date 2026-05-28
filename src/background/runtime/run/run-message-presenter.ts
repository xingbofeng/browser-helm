import type { AgentMessage } from '../../../shared/schemas/agent-message.schema';
import type { RunSnapshot } from '../../../runtime/runtime-messages';
import type { DebugReport } from '../../../shared/schemas/diagnosis.schema';
import { buildUserFacingPageSummary } from '../../../shared/page-summary';
import { t } from '../../../i18n/t';
import type { Locale } from '../../../i18n/types';

/**
 * Creates initial messages for a new run.
 */
export function initialMessages(
  runId: string,
  task: string,
  localeOrOptions: Locale | {
    includeUserTask?: boolean | undefined;
    includeObserveStatus?: boolean | undefined;
  } = 'zh',
  options: {
    includeUserTask?: boolean | undefined;
    includeObserveStatus?: boolean | undefined;
  } = {}
): AgentMessage[] {
  const locale = typeof localeOrOptions === 'string' ? localeOrOptions : 'zh';
  const messageOptions = typeof localeOrOptions === 'string' ? options : localeOrOptions;
  const now = Date.now();
  const messages: AgentMessage[] = [];
  if (messageOptions.includeUserTask !== false) {
    messages.push({
      id: `${runId}:task`,
      role: 'user',
      kind: 'task',
      status: 'complete',
      content: task,
      createdAt: now,
      updatedAt: now
    });
  }
  if (messageOptions.includeObserveStatus) {
    messages.push({
      id: `${runId}:observe-status`,
      role: 'agent',
      kind: 'agent_status',
      status: 'streaming',
      title: t('observe.statusTitle', locale),
      content: t('observe.statusContent', locale),
      createdAt: now,
      updatedAt: now
    });
  }
  return messages;
}

/**
 * Creates a page summary message from observation data.
 */
export function pageSummaryMessage(
  runId: string,
  observation: NonNullable<RunSnapshot['observation']>,
  locale: Locale = 'zh'
): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:page-summary`,
    role: 'agent',
    kind: 'page_summary',
    status: 'complete',
    title: t('page.observation.summary', locale),
    content: buildUserFacingPageSummary({
      title: observation.title,
      currentDomain: observation.currentDomain,
      url: observation.url,
      pageStateSummary: observation.pageStateSummary,
      interactiveCount: observation.interactiveCount,
      warnings: observation.warnings
    }, locale),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates a diagnosis message from a debug report.
 * Only includes the first 3 findings.
 */
export function diagnosisMessage(runId: string, report: DebugReport, locale: Locale = 'zh'): AgentMessage {
  const now = Date.now();
  const findingText = report.findings
    .map((finding) => finding.title)
    .filter(Boolean)
    .slice(0, 3)
    .join('\n');
  return {
    id: `${runId}:diagnosis`,
    role: 'agent',
    kind: 'diagnosis',
    status: 'complete',
    title: report.title,
    content: findingText || t('page.observation.noFindings', locale),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates an agent status message.
 */
export function agentStatusMessage(runId: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:tool-status:${title}`,
    role: 'agent',
    kind: 'agent_status',
    status: 'complete',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}

export function toolStatusMessage(runId: string, tool: string, summary: string, locale: Locale = 'zh'): AgentMessage {
  return agentStatusMessage(runId, humanToolStatusTitle(tool, locale), summary);
}

/**
 * Creates an error message.
 */
export function errorMessage(runId: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:error:${title}`,
    role: 'agent',
    kind: 'error',
    status: 'error',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Inserts a new message or updates an existing one by id.
 * Preserves the original createdAt timestamp when updating.
 */
export function upsertMessage(messages: AgentMessage[], message: AgentMessage): void {
  const index = messages.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    messages[index] = {
      ...messages[index],
      ...message,
      createdAt: messages[index]?.createdAt ?? message.createdAt
    };
    return;
  }
  messages.push(message);
}

/**
 * Removes the temporary observe status once a page summary can replace it.
 */
export function completeObserveStatusMessage(messages: AgentMessage[]): void {
  const index = messages.findIndex((item) => item.id.endsWith(':observe-status'));
  if (index < 0) {
    return;
  }
  messages.splice(index, 1);
}

function humanToolStatusTitle(tool: string, locale: Locale): string {
  if (tool.includes('page_observe')) return t('tool.status.observe', locale);
  if (tool.includes('page_read_article')) return t('tool.status.readArticle', locale);
  if (tool.includes('page_read_visible_text')) return t('tool.status.readVisibleText', locale);
  if (tool.includes('iframe_list')) return t('tool.status.iframeList', locale);
  if (tool.includes('iframe_read')) return t('tool.status.iframeRead', locale);
  if (tool.includes('viewport_scroll')) return t('tool.status.viewportScroll', locale);
  if (tool.includes('form_infer_fill_plan')) return t('tool.status.formInferPlan', locale);
  if (tool.includes('form_fill')) return t('tool.status.formFill', locale);
  if (tool.includes('form_verify')) return t('tool.status.formVerify', locale);
  if (tool.includes('form_submit')) return t('tool.status.formSubmit', locale);
  return t('tool.status.default', locale, { tool });
}
