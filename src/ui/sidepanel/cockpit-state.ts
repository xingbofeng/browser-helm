import type { TranslationParams } from '../../i18n/types';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunDisplayState } from '../stores/agent-store';

type TFunction = (key: string, params?: TranslationParams) => string;

export function mergeAgentMessages(
  existingMessages: AgentMessage[],
  nextMessages: AgentMessage[]
): AgentMessage[] {
  if (nextMessages.length === 0) {
    return existingMessages;
  }
  const messagesById = new Map(existingMessages.map((message) => [message.id, message]));
  const orderedIds = existingMessages.map((message) => message.id);
  for (const message of nextMessages) {
    if (!messagesById.has(message.id)) {
      orderedIds.push(message.id);
    }
    messagesById.set(message.id, message);
  }
  return orderedIds
    .map((id) => messagesById.get(id))
    .filter((message): message is AgentMessage => Boolean(message));
}

export function toDrawerDecision(
  decision: 'pending' | 'approved' | 'denied' | 'expired' | undefined
): 'approved' | 'denied' | undefined {
  return decision === 'approved' || decision === 'denied' ? decision : undefined;
}

export function shouldRetryAutoObserve(snapshot: RunSnapshot): boolean {
  if (snapshot.status === 'observing' || snapshot.status === 'executing_tool') {
    return true;
  }
  if (snapshot.status !== 'observed' && snapshot.status !== 'empty') {
    return false;
  }
  const observationText = [
    snapshot.observation?.url,
    snapshot.observation?.title,
    snapshot.observation?.visibleTextSummary,
    snapshot.structuredPageData?.observation.summary
  ].join(' ');
  const forms = snapshot.structuredPageData?.forms;
  return /iframe|frame/i.test(observationText) && forms?.status !== 'ready';
}

export function statusToDisplayState(
  status: RunSnapshot['status'] | undefined,
  busy: boolean
): RunDisplayState {
  if (busy) {
    return 'starting';
  }
  if (status === 'waiting_for_approval') {
    return 'waiting_for_approval';
  }
  if (
    status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'waiting_for_user' ||
    status === 'recovering' ||
    status === 'finished'
  ) {
    return status;
  }
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  if (status === 'observed' || status === 'empty') {
    return 'finished';
  }
  return 'idle';
}

export function statusLabel(status: RunDisplayState, t: TFunction): string {
  const labels: Record<RunDisplayState, string> = {
    idle: t('status.ready'),
    starting: t('status.starting'),
    observing: t('status.observing'),
    thinking: t('status.thinking'),
    executing_tool: t('status.running'),
    waiting_for_approval: t('status.approval'),
    waiting_for_user: t('status.waiting'),
    recovering: t('status.recovering'),
    finished: t('status.done'),
    failed: t('status.error'),
    cancelled: t('status.stopped')
  };
  return labels[status];
}

export function isRunActiveForGoalRevision(status: RunSnapshot['status'] | undefined): boolean {
  return status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'waiting_for_user' ||
    status === 'recovering' ||
    status === 'waiting_for_approval';
}

export function readTaskMessageContent(snapshot: RunSnapshot | undefined): string | undefined {
  const taskMessage = [...(snapshot?.messages ?? [])]
    .reverse()
    .find((message) => message.kind === 'task' && message.role === 'user');
  const task = taskMessage?.content.trim();
  return task ? task : undefined;
}

export function conversationHistoryFromMessages(
  messages: AgentMessage[],
  snapshot?: RunSnapshot
): NonNullable<Parameters<RuntimePort['startRun']>[0]['conversationHistory']> | undefined {
  const sourceMessages = snapshot?.messages
    ? mergeAgentMessages(messages, snapshot.messages)
    : messages;
  const history = sourceMessages
    .filter((message) => message.content.trim().length > 0)
    .map((message) => ({
      role: message.role,
      ...(message.title ? { title: message.title } : {}),
      content: message.content
    }));
  if (snapshot?.trace?.length) {
    history.push({
      role: 'system',
      title: 'Previous run trace',
      content: JSON.stringify(snapshot.trace)
    });
  }
  return history.length ? history : undefined;
}

export function localErrorMessage(id: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id,
    role: 'agent',
    kind: 'error',
    status: 'error',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
}

export function emptyStructuredPageData(): StructuredPageData {
  const updatedAt = '2026-05-25T00:00:00.000Z';

  return {
    observation: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    refs: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    interactive: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    forms: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    }
  };
}
