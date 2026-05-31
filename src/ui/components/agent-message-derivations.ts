import type { Locale, TranslationParams } from '../../i18n/types';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import { buildUserFacingPageSummary } from '../../shared/page-summary';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';

type TFunction = (key: string, params?: TranslationParams) => string;

export function isModeSwitchRequest(message: AgentMessage): boolean {
  return message.kind === 'recommendation' && message.id.endsWith(':mode-switch-request');
}

export function lastFinalAnswerMessageIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isFinalAnswerMessage(message)) {
      return index;
    }
  }
  return -1;
}

export function currentAgentReplyMessageIndex(messages: AgentMessage[], runId?: string): number {
  if (runId) {
    const currentRunIndex = messages.findIndex((message) =>
      runIdFromMessageId(message.id) === runId &&
      isAgentReplyMessage(message)
    );
    if (currentRunIndex >= 0) {
      return currentRunIndex;
    }
  }
  const lastTaskIndex = messages.reduce(
    (lastIndex, message, index) => message.kind === 'task' && message.role === 'user' ? index : lastIndex,
    -1
  );
  for (let index = Math.max(0, lastTaskIndex + 1); index < messages.length; index += 1) {
    const message = messages[index];
    if (message && isAgentReplyMessage(message)) {
      return index;
    }
  }
  return -1;
}

export function shouldShowReplyStatus(snapshot: RunSnapshot | undefined, messages: AgentMessage[]): boolean {
  if (!snapshot) {
    return false;
  }
  if (
    snapshot.status === 'observing' ||
    snapshot.status === 'thinking' ||
    snapshot.status === 'executing_tool' ||
    snapshot.status === 'recovering' ||
    snapshot.status === 'waiting_for_approval'
  ) {
    return true;
  }
  if (snapshot.status === 'failed' || snapshot.status === 'error') {
    return currentAgentReplyMessageIndex(messages, snapshot.runId) < 0;
  }
  return false;
}

export function prepareDisplayMessages(messages: AgentMessage[]): AgentMessage[] {
  const lastPageSummaryIndex = messages.reduce(
    (lastIndex, message, index) => message.kind === 'page_summary' ? index : lastIndex,
    -1
  );
  const lastObserveStatusIndex = messages.reduce(
    (lastIndex, message, index) => message.id.endsWith(':observe-status') ? index : lastIndex,
    -1
  );
  const filtered = messages.filter((message, index) => {
    if (shouldHideRawDecisionMessage(message)) {
      return false;
    }
    if (isDuplicateModeSwitchContinuationTask(messages, index)) {
      return false;
    }
    if (message.kind === 'page_summary') {
      return index === lastPageSummaryIndex;
    }
    if (!message.id.endsWith(':observe-status')) {
      if (
        message.id.endsWith(':provider-response') &&
        message.status === 'streaming' &&
        message.content.trim().length === 0
      ) {
        return false;
      }
      return true;
    }
    if (lastPageSummaryIndex >= 0) {
      return false;
    }
    return index === lastObserveStatusIndex;
  });
  return placePageSummaryAtStart(filtered);
}

export function withDerivedPageSummary(
  messages: AgentMessage[],
  snapshot: RunSnapshot,
  t: TFunction,
  locale: Locale
): AgentMessage[] {
  const nextMessages = [...messages];
  if (!nextMessages.some((message) => message.kind === 'page_summary')) {
    const item = snapshot.structuredPageData?.observation.items[0];
    const summary = buildUserFacingPageSummary({
      title: item?.title ?? snapshot.observation?.title,
      currentDomain: item?.currentDomain ?? snapshot.observation?.currentDomain,
      url: item?.url ?? snapshot.observation?.url,
      pageStateSummary: item?.pageStateSummary ?? snapshot.observation?.pageStateSummary,
      interactiveCount: snapshot.observation?.interactiveCount,
      warnings: snapshot.observation?.warnings
    }, locale);
    if (summary || item || snapshot.observation) {
      const title = item?.title ?? snapshot.observation?.title ?? t('page.observation.summary');
      const anchorRunId = pageSummaryAnchorRunId(nextMessages, snapshot.runId);
      nextMessages.unshift({
        id: `${anchorRunId}:derived-page-summary`,
        role: 'agent',
        kind: 'page_summary',
        status: 'complete',
        title,
        content: summary || t('page.observation.readonlyDone'),
        createdAt: 0,
        updatedAt: 0
      });
    }
  }
  appendFinalProviderText(nextMessages, snapshot, t);
  appendDebugReportMessages(nextMessages, snapshot, t);
  return nextMessages;
}

export function fallbackMessages(
  snapshot: RunSnapshot | undefined,
  t: TFunction,
  locale: Locale
): AgentMessage[] {
  if (!snapshot) {
    return [
      {
        id: 'empty-welcome',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: t('fallback.welcomeTitle'),
        content: t('fallback.welcomeContent'),
        createdAt: 0,
        updatedAt: 0
      }
    ];
  }
  const content = snapshot.error?.message ??
    snapshot.debugReport?.title ??
    (snapshot.observation ? buildUserFacingPageSummary(snapshot.observation, locale) : undefined) ??
    t('fallback.ready');
  return [
    {
      id: `${snapshot.runId}:fallback`,
      role: 'agent',
      kind: snapshot.error ? 'error' : 'agent_status',
      status: snapshot.error ? 'error' : 'complete',
      title: snapshot.error ? t('fallback.errorTitle') : t('fallback.pageStatus'),
      content,
      createdAt: 0,
      updatedAt: 0
    }
  ];
}

export function countSummaryText(text: string | undefined): number {
  const normalized = text?.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/u).filter(Boolean).length;
}

export function countLinks(snapshot: RunSnapshot | undefined): number {
  const refs = snapshot?.structuredPageData?.refs.items ?? snapshot?.refs ?? [];
  return refs.filter((ref) =>
    ref.role === 'link' || ref.tagName.toLowerCase() === 'a'
  ).length;
}

export function domainFromSummary(text: string): string | undefined {
  const match = text.match(/来源：([^。\n]+)。|Source: ([^.\n]+)\./u);
  return match?.[1] ?? match?.[2];
}

function appendFinalProviderText(
  messages: AgentMessage[],
  snapshot: RunSnapshot,
  t: TFunction
): void {
  const streaming = snapshot.streaming;
  const finalProviderText = streaming?.active === false
    ? streaming.finalText?.trim()
      ? streaming.finalText?.trim()
      : undefined
    : undefined;
  const finalProviderFinishedAt = streaming?.finishedAt;
  if (!finalProviderText || isRawAgentDecision(finalProviderText)) {
    return;
  }

  const providerMessageId = `${snapshot.runId}:provider-response`;
  const providerMessageIndex = messages.findIndex((message) => message.id === providerMessageId);
  const providerMessage = providerMessageIndex >= 0 ? messages[providerMessageIndex] : undefined;
  if (providerMessage?.content.trim() && providerMessage.status === 'complete') {
    return;
  }
  const completedProviderMessage: AgentMessage = {
    id: providerMessageId,
    role: 'agent',
    kind: providerMessage?.kind ?? 'agent_status',
    status: 'complete',
    title: providerMessage?.title ?? t('messageList.browserHelm'),
    content: finalProviderText,
    createdAt: providerMessage?.createdAt ?? finalProviderFinishedAt ?? 0,
    updatedAt: finalProviderFinishedAt ?? providerMessage?.updatedAt ?? 0
  };
  if (providerMessageIndex >= 0) {
    messages[providerMessageIndex] = completedProviderMessage;
  } else {
    messages.push(completedProviderMessage);
  }
}

function appendDebugReportMessages(
  messages: AgentMessage[],
  snapshot: RunSnapshot,
  t: TFunction
): void {
  if (snapshot.debugReport && !messages.some((message) => message.kind === 'diagnosis')) {
    const findingText = snapshot.debugReport.findings
      .map((finding) => finding.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
    messages.push({
      id: `${snapshot.runId}:derived-diagnosis`,
      role: 'agent',
      kind: 'diagnosis',
      status: 'complete',
      title: snapshot.debugReport.title,
      content: findingText || t('page.observation.noFindings'),
      createdAt: 0,
      updatedAt: 0
    });
  }
  if (snapshot.debugReport && !messages.some((message) => message.kind === 'recommendation')) {
    const recommendationText = snapshot.debugReport.recommendations
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
    if (recommendationText) {
      messages.push({
        id: `${snapshot.runId}:derived-recommendation`,
        role: 'agent',
        kind: 'recommendation',
        status: 'complete',
        title: t('page.observation.recommendation'),
        content: recommendationText,
        createdAt: 0,
        updatedAt: 0
      });
    }
  }
}

function isAgentReplyMessage(message: AgentMessage): boolean {
  return message.role === 'agent' && message.kind !== 'page_summary';
}

function isFinalAnswerMessage(message: AgentMessage): boolean {
  return message.role === 'agent' &&
    message.status === 'complete' &&
    message.kind === 'agent_status' &&
    !shouldHideRawDecisionMessage(message) &&
    (
      message.id.endsWith(':agent-final') ||
      message.id.endsWith(':provider-response')
    );
}

function shouldHideRawDecisionMessage(message: AgentMessage): boolean {
  if (message.role !== 'agent' || message.kind !== 'agent_status') {
    return false;
  }
  return isRawAgentDecision(message.content);
}

function isDuplicateModeSwitchContinuationTask(messages: AgentMessage[], index: number): boolean {
  const message = messages[index];
  if (!message || message.role !== 'user' || message.kind !== 'task') {
    return false;
  }
  const content = message.content.trim();
  if (!content) {
    return false;
  }
  const currentRunId = runIdFromMessageId(message.id);
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const candidate = messages[cursor];
    if (!candidate || candidate.role !== 'user' || candidate.kind !== 'task') {
      continue;
    }
    const hasModeSwitchBetween = messages
      .slice(cursor + 1, index)
      .some((betweenMessage) => isModeSwitchRequest(betweenMessage));
    return candidate.content.trim() === content &&
      runIdFromMessageId(candidate.id) !== currentRunId &&
      hasModeSwitchBetween;
  }
  return false;
}

function placePageSummaryAtStart(messages: AgentMessage[]): AgentMessage[] {
  const pageSummaryIndex = messages.findIndex((message) => message.kind === 'page_summary');
  if (pageSummaryIndex < 0) {
    return messages;
  }
  const pageSummary = messages[pageSummaryIndex];
  if (!pageSummary) {
    return messages;
  }
  const withoutPageSummary = messages.filter((_, index) => index !== pageSummaryIndex);
  return [pageSummary, ...withoutPageSummary];
}

function pageSummaryAnchorRunId(messages: AgentMessage[], fallbackRunId: string): string {
  const firstTask = messages.find((message) => message.kind === 'task' && message.role === 'user');
  return firstTask ? runIdFromMessageId(firstTask.id) : fallbackRunId;
}

function runIdFromMessageId(id: string): string {
  return id.split(':')[0] ?? id;
}

function isRawAgentDecision(value: string): boolean {
  const trimmed = value.trim();
  if (looksLikeStreamingAgentDecision(trimmed)) {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown; decision?: unknown };
    const type = typeof parsed.type === 'string' ? parsed.type : undefined;
    const decision = typeof parsed.decision === 'string' ? parsed.decision : undefined;
    return type === 'decision' ||
      type === 'multi' ||
      type === 'tool_call' ||
      type === 'finish' ||
      type === 'ask_user' ||
      type === 'needs_user_input' ||
      type === 'fail' ||
      decision === 'tool_call' ||
      decision === 'finish' ||
      decision === 'ask_user' ||
      decision === 'needs_user_input' ||
      decision === 'fail';
  } catch {
    return false;
  }
}

function looksLikeStreamingAgentDecision(value: string): boolean {
  return value.startsWith('{') &&
    /"type"\s*:\s*"(decision|multi|tool_call|finish|ask_user|needs_user_input|fail)"/u.test(value);
}
