import type { AgentMessage } from '../../../shared/schemas/agent-message.schema';
import type { RunSnapshot } from '../../../runtime/runtime-messages';
import type { DebugReport } from '../../../shared/schemas/diagnosis.schema';
import { buildUserFacingPageSummary } from '../../../shared/page-summary';

/**
 * Creates initial messages for a new run.
 */
export function initialMessages(
  runId: string,
  task: string,
  options: {
    includeUserTask?: boolean | undefined;
    includeObserveStatus?: boolean | undefined;
  } = {}
): AgentMessage[] {
  const now = Date.now();
  const messages: AgentMessage[] = [];
  if (options.includeUserTask !== false) {
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
  if (options.includeObserveStatus) {
    messages.push({
      id: `${runId}:observe-status`,
      role: 'agent',
      kind: 'agent_status',
      status: 'streaming',
      title: '正在观察当前页面',
      content: 'BrowserHelm 正在读取当前页面摘要和可交互结构。',
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
  observation: NonNullable<RunSnapshot['observation']>
): AgentMessage {
  const now = Date.now();
  return {
    id: `${runId}:page-summary`,
    role: 'agent',
    kind: 'page_summary',
    status: 'complete',
    title: '页面摘要',
    content: buildUserFacingPageSummary({
      title: observation.title,
      currentDomain: observation.currentDomain,
      url: observation.url,
      pageStateSummary: observation.pageStateSummary,
      interactiveCount: observation.interactiveCount,
      warnings: observation.warnings
    }),
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Creates a diagnosis message from a debug report.
 * Only includes the first 3 findings.
 */
export function diagnosisMessage(runId: string, report: DebugReport): AgentMessage {
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
    content: findingText || '暂未发现高置信度问题。',
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

export function toolStatusMessage(runId: string, tool: string, summary: string): AgentMessage {
  return agentStatusMessage(runId, humanToolStatusTitle(tool), summary);
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

function humanToolStatusTitle(tool: string): string {
  if (tool.includes('page_observe')) return '页面观察完成';
  if (tool.includes('page_read_article')) return '正文读取完成';
  if (tool.includes('page_read_visible_text')) return '可见文本读取完成';
  if (tool.includes('iframe_list')) return 'iframe 检测完成';
  if (tool.includes('iframe_read')) return 'iframe 读取完成';
  if (tool.includes('viewport_scroll')) return '页面滚动完成';
  if (tool.includes('form_infer_fill_plan')) return '表单填写计划完成';
  if (tool.includes('form_fill')) return '字段填写完成';
  if (tool.includes('form_verify')) return '表单验证完成';
  if (tool.includes('form_submit')) return '提交确认已准备';
  return `工具 ${tool}`;
}
