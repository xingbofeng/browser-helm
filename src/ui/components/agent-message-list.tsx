import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link,
  LoaderCircle,
  Wrench,
  UserRound
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { useLocale, useT } from '../../i18n/context';
import type { Locale } from '../../i18n/types';

import type { RunSnapshot } from '../../runtime/runtime-messages';
import { buildUserFacingPageSummary } from '../../shared/page-summary';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { DebugReport } from '../../shared/schemas/diagnosis.schema';
import { StreamingMarkdown } from './streaming-markdown';
import { FormActionCard } from './form-action-card';

type AgentMessageListProps = {
  snapshot?: RunSnapshot | undefined;
  onModeSwitchContinue?: (() => void) | undefined;
  onModeSwitchDismiss?: (() => void) | undefined;
};

export function AgentMessageList({
  snapshot,
  onModeSwitchContinue,
  onModeSwitchDismiss
}: AgentMessageListProps) {
  const t = useT();
  const locale = useLocale();
  const [dismissedModeSwitchIds, setDismissedModeSwitchIds] = useState<Set<string>>(() => new Set());
  const waterfallRef = useRef<HTMLElement>(null);
  const hasRuntimeMessages = Boolean(snapshot?.messages?.length);
  const baseMessages = hasRuntimeMessages ? snapshot?.messages ?? [] : fallbackMessages(snapshot, t, locale);
  const rawMessages = snapshot
    ? withDerivedPageSummary(baseMessages, snapshot, t, locale)
    : baseMessages;
  const messages = prepareDisplayMessages(rawMessages).filter(
    (message) => !dismissedModeSwitchIds.has(message.id)
  );
  const showReplyStatus = shouldShowReplyStatus(snapshot, messages);
  const progress = showReplyStatus ? buildRunProgress(snapshot, t) : undefined;
  const flowItems = showReplyStatus ? buildRunFlowItems(snapshot, t) : [];
  const statusAnchorIndex = flowItems.length > 0 || progress
    ? currentAgentReplyMessageIndex(messages, snapshot?.runId)
    : -1;
  const messagesBeforeStatus = statusAnchorIndex >= 0 ? messages.slice(0, statusAnchorIndex) : messages;
  const messagesAfterStatus = statusAnchorIndex >= 0 ? messages.slice(statusAnchorIndex) : [];
  const hasFinalAnswer = lastFinalAnswerMessageIndex(messages) >= 0;
  const showFormActionCard = !hasFinalAnswer && flowItems.length === 0 && !progress && Boolean(
    snapshot?.toolResult && snapshot.toolResult.tool.startsWith('bh_form_')
  );
  const nowTick = useNowTick(Boolean(progress));
  const shouldAutoScrollRef = useRef(true);
  const messageScrollAnchor = messages
    .map((message) =>
      `${message.id}:${message.status}:${message.updatedAt}:${message.content.length}`
    )
    .join('|');
  const scrollAnchor = `${messageScrollAnchor}${progress ? `|progress:${progress.label}:${nowTick}` : ''}`;

  const scrollToBottom = useCallback(() => {
    if (waterfallRef.current) {
      waterfallRef.current.scrollTop = waterfallRef.current.scrollHeight;
    }
  }, []);

  // 消息 / 进度变化时滚动到底部
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [scrollAnchor, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = waterfallRef.current;
    if (!container) return;
    shouldAutoScrollRef.current = isNearBottom(container);
  }, []);

  // streaming 高频更新时用 ResizeObserver 兜底，确保内容高度增长时自动跟随
  useEffect(() => {
    const container = waterfallRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // 用户在手动上翻时不强制滚动
      if (shouldAutoScrollRef.current || isNearBottom(container)) {
        scrollToBottom();
        shouldAutoScrollRef.current = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  return (
    <section
      ref={waterfallRef}
      className="bh-agentWaterfall"
      aria-label={t('messageList.aria')}
      onScroll={handleScroll}
    >
      {messagesBeforeStatus.map((message) => renderAgentMessage({
        message,
        snapshot,
        t,
        onModeSwitchContinue,
        onModeSwitchDismiss,
        setDismissedModeSwitchIds
      }))}
      {showFormActionCard && snapshot?.toolResult ? (
        <FormActionCard toolResult={snapshot.toolResult} snapshot={snapshot} />
      ) : null}
      {flowItems.length > 0 ? <RunFlowTimeline items={flowItems} t={t} /> : null}
      {flowItems.length === 0 && progress ? <RunProgressCard progress={progress} now={nowTick} /> : null}
      {messagesAfterStatus.map((message) => renderAgentMessage({
        message,
        snapshot,
        t,
        onModeSwitchContinue,
        onModeSwitchDismiss,
        setDismissedModeSwitchIds
      }))}
    </section>
  );
}

function renderAgentMessage(input: {
  message: AgentMessage;
  snapshot?: RunSnapshot | undefined;
  t: ReturnType<typeof useT>;
  onModeSwitchContinue?: (() => void) | undefined;
  onModeSwitchDismiss?: (() => void) | undefined;
  setDismissedModeSwitchIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  const {
    message,
    snapshot,
    t,
    onModeSwitchContinue,
    onModeSwitchDismiss,
    setDismissedModeSwitchIds
  } = input;
  return (
    <article
      key={message.id}
      className={`bh-agentMessage bh-agentMessage-${message.role} bh-agentMessage-${message.kind}`}
      data-message-kind={message.kind}
      data-message-status={message.status}
    >
      <div className="bh-agentMessageIcon" aria-hidden="true">
        {iconForMessage(message)}
      </div>
      <div className="bh-agentMessageBody">
        {message.reasoning ? (
          <details className="bh-reasoningSection">
            <summary>{t('messageList.reasoning')}</summary>
            <StreamingMarkdown content={message.reasoning} className="bh-markdownContent" />
          </details>
        ) : null}
        {message.kind === 'page_summary' ? (
          <PageObservationCard message={message} snapshot={snapshot} t={t} />
        ) : message.role === 'agent' && message.content ? (
          <>
            {message.title ? <h2>{message.title}</h2> : null}
            <StreamingMarkdown content={message.content} className="bh-markdownContent" />
          </>
        ) : message.content ? (
          <>
            {message.title ? <h2>{message.title}</h2> : null}
            <p>{message.content}</p>
          </>
        ) : (
          <p>{t('messageList.waitingOutput')}</p>
        )}
        {message.kind === 'diagnosis' && snapshot?.debugReport ? (
          <DebugReportSummary report={snapshot.debugReport} />
        ) : null}
        {message.status === 'streaming' ? <span className="bh-streamingDots">{t('messageList.streaming')}</span> : null}
        {isModeSwitchRequest(message) ? (
          <div className="bh-modeSwitchActions">
            <button
              type="button"
              className="bh-modeSwitchPrimary"
              onClick={() => {
                setDismissedModeSwitchIds((current) => new Set(current).add(message.id));
                onModeSwitchContinue?.();
              }}
            >
              {t('runtime.modeSwitch.continueAct')}
            </button>
            <button
              type="button"
              className="bh-modeSwitchSecondary"
              onClick={() => {
                setDismissedModeSwitchIds((current) => new Set(current).add(message.id));
                onModeSwitchDismiss?.();
              }}
            >
              {t('runtime.modeSwitch.keepAsk')}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function isNearBottom(container: HTMLElement): boolean {
  return container.scrollHeight - container.scrollTop - container.clientHeight <= 32;
}

function isModeSwitchRequest(message: AgentMessage): boolean {
  return message.kind === 'recommendation' && message.id.endsWith(':mode-switch-request');
}

function lastFinalAnswerMessageIndex(messages: AgentMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && isFinalAnswerMessage(message)) {
      return index;
    }
  }
  return -1;
}

function currentAgentReplyMessageIndex(messages: AgentMessage[], runId?: string): number {
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

function isAgentReplyMessage(message: AgentMessage): boolean {
  return message.role === 'agent' && message.kind !== 'page_summary';
}

function shouldShowReplyStatus(snapshot: RunSnapshot | undefined, messages: AgentMessage[]): boolean {
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

function prepareDisplayMessages(messages: AgentMessage[]): AgentMessage[] {
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

function runIdFromMessageId(id: string): string {
  return id.split(':')[0] ?? id;
}

function PageObservationCard({
  message,
  snapshot,
  t
}: {
  message: AgentMessage;
  snapshot?: RunSnapshot | undefined;
  t: ReturnType<typeof useT>;
}) {
  const observation = snapshot?.structuredPageData?.observation.items[0];
  const currentDomain =
    observation?.currentDomain ??
    snapshot?.observation?.currentDomain ??
    domainFromSummary(message.content) ??
    t('page.observation.fallbackDomain');
  const url = observation?.url ?? snapshot?.observation?.url;
  const textCount = countSummaryText(observation?.visibleTextSummary ?? message.content);
  const linkCount = countLinks(snapshot);
  const formCount = snapshot?.structuredPageData?.forms.count ?? 0;
  const updatedAt = message.updatedAt || snapshot?.structuredPageData?.observation.updatedAt;
  return (
    <section className="bh-qaCard bh-pageObservationCard">
      <header className="bh-qaCardHeader">
        <span className="bh-qaCardStatusIcon" aria-hidden="true">
          <CheckCircle2 size={24} />
        </span>
        <h2>{t('page.observation.completed')}</h2>
        {updatedAt ? <time>{formatMessageTime(updatedAt)}</time> : null}
        <ChevronDown size={17} aria-hidden="true" />
      </header>
      <div className="bh-pageObservationBody">
        <p>
          <strong>{t('page.observation.currentPage')}：</strong>
          {url ? <span title={url}>{currentDomain}</span> : currentDomain}
        </p>
        <StreamingMarkdown content={message.content} className="bh-markdownContent" />
      </div>
      <ul className="bh-pageObservationStats" aria-label={t('page.observation.statsAria')}>
        <li><FileText size={15} />{t('page.observation.textCount', { count: String(textCount) })}</li>
        <li><Link size={15} />{t('page.observation.linkCount', { count: String(linkCount) })}</li>
        <li><FileText size={15} />{t('page.observation.formCount', { count: String(formCount) })}</li>
      </ul>
    </section>
  );
}

function withDerivedPageSummary(
  messages: AgentMessage[],
  snapshot: RunSnapshot,
  t: ReturnType<typeof useT>,
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
  const streaming = snapshot.streaming;
  const finalProviderText = streaming?.active === false
    ? streaming.finalText?.trim()
    : undefined;
  const finalProviderFinishedAt = streaming?.finishedAt;
  if (finalProviderText && !isRawAgentDecision(finalProviderText)) {
    const providerMessageId = `${snapshot.runId}:provider-response`;
    const providerMessageIndex = nextMessages.findIndex((message) =>
      message.id === providerMessageId
    );
    const providerMessage = providerMessageIndex >= 0
      ? nextMessages[providerMessageIndex]
      : undefined;
    if (!providerMessage?.content.trim() || providerMessage.status !== 'complete') {
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
        nextMessages[providerMessageIndex] = completedProviderMessage;
      } else {
        nextMessages.push(completedProviderMessage);
      }
    }
  }
  if (snapshot.debugReport && !nextMessages.some((message) => message.kind === 'diagnosis')) {
    const findingText = snapshot.debugReport.findings
      .map((finding) => finding.title)
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
    nextMessages.push({
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
  if (snapshot.debugReport && !nextMessages.some((message) => message.kind === 'recommendation')) {
    const recommendationText = snapshot.debugReport.recommendations
      .filter(Boolean)
      .slice(0, 3)
      .join('\n');
    if (recommendationText) {
      nextMessages.push({
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
  return nextMessages;
}

function pageSummaryAnchorRunId(messages: AgentMessage[], fallbackRunId: string): string {
  const firstTask = messages.find((message) => message.kind === 'task' && message.role === 'user');
  return firstTask ? runIdFromMessageId(firstTask.id) : fallbackRunId;
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

type RunProgress = {
  label: string;
  detail: string;
  startedAt: number;
  spinning?: boolean | undefined;
};

type RunFlowItem = {
  id: string;
  kind: 'reasoning' | 'tool';
  title: string;
  summary: string;
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  endedAt?: number | undefined;
  open: boolean;
};

const MAX_VISIBLE_RUN_FLOW_ITEMS = 3;

function RunFlowTimeline({ items, t }: { items: RunFlowItem[]; t: ReturnType<typeof useT> }) {
  const item = items.find((candidate) => candidate.open) ?? items.at(-1);
  if (!item) {
    return null;
  }
  return (
    <section
      className={`bh-runFlow bh-replyStatus is-${item.kind} is-${item.status}`}
      aria-label={t('runFlow.aria')}
      role="status"
      aria-live="polite"
    >
      <span className="bh-replyStatusIcon" aria-hidden="true">
        {iconForRunFlowItem(item)}
      </span>
      <div className="bh-replyStatusBody">
        <div className="bh-replyStatusLine">
          <strong>{titleForRunFlowItem(item, t)}</strong>
          {item.endedAt !== undefined ? <time>{formatDuration(item.startedAt, item.endedAt)}</time> : null}
        </div>
        <p>{item.summary}</p>
      </div>
    </section>
  );
}

function iconForRunFlowItem(item: RunFlowItem) {
  if (item.status === 'running') {
    return <LoaderCircle size={16} className="is-spinning" />;
  }
  if (item.status === 'error') {
    return <AlertCircle size={16} />;
  }
  if (item.kind === 'tool') {
    return <Wrench size={16} />;
  }
  return <Check size={16} />;
}

function titleForRunFlowItem(item: RunFlowItem, t: ReturnType<typeof useT>): string {
  if (
    item.status === 'error' ||
    item.id.includes('model_stream_fallback_started') ||
    item.id.includes('decision_parse_failed')
  ) {
    return item.title;
  }
  if (item.kind === 'tool') {
    return t('runFlow.toolStatus');
  }
  return t('runFlow.thinkingStatus');
}

function RunProgressCard({
  progress,
  now
}: {
  progress: RunProgress;
  now: number;
}) {
  const elapsedSeconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));
  return (
    <article className="bh-runProgressCard" role="status" aria-live="polite">
      <span
        className={`bh-runProgressSpinner${progress.spinning === false ? '' : ' is-spinning'}`}
        aria-hidden="true"
      >
        <LoaderCircle size={17} />
      </span>
      <div>
        <strong>{progress.label}</strong>
        <p>{progress.detail}</p>
      </div>
      <time>{elapsedSeconds}s</time>
    </article>
  );
}

function buildRunProgress(snapshot: RunSnapshot | undefined, t: ReturnType<typeof useT>): RunProgress | undefined {
  if (!snapshot || !isActiveRunStatus(snapshot.status)) {
    return undefined;
  }
  const trace = snapshot.trace ?? [];
  const latestToolStarted = [...trace].reverse().find((event) => event.type === 'tool_started');
  if (snapshot.status === 'executing_tool' && latestToolStarted) {
    const payload = recordPayload(latestToolStarted.payload);
    const tool = stringValue(payload.tool) ?? '';
    return {
      label: humanToolLabel(tool, t),
      detail: t('runProgress.executingDetail', { tool }),
      startedAt: latestToolStarted.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'thinking') {
    return thinkingProgressFromTrace(trace, t);
  }
  if (snapshot.status === 'observing') {
    return {
      label: t('runProgress.observing'),
      detail: t('runProgress.observingDetail'),
      startedAt: latestToolStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'recovering') {
    return {
      label: t('runProgress.recovering'),
      detail: t('runProgress.recoveringDetail'),
      startedAt: Date.now()
    };
  }
  return undefined;
}

function buildRunFlowItems(snapshot: RunSnapshot | undefined, t: ReturnType<typeof useT>): RunFlowItem[] {
  const fullTrace = snapshot?.trace ?? [];
  if (!fullTrace.some((event) =>
    event.type === 'turn_started' ||
    event.type === 'context_built' ||
    event.type.startsWith('model_stream_') ||
    event.type === 'decision_parse_failed' ||
    event.type === 'model_decision' ||
    event.type === 'tool_started'
  )) {
    return [];
  }
  const latestTurnIndex = findLastTraceIndex(fullTrace, (event) => event.type === 'turn_started');
  const trace = latestTurnIndex >= 0 ? fullTrace.slice(latestTurnIndex) : fullTrace;

  const items: RunFlowItem[] = [];
  let streamItemIndex = -1;
  for (const [index, event] of trace.entries()) {
    const timestamp = event.timestamp ?? Date.now();
    const payload = recordPayload(event.payload);
    if (event.type === 'turn_started') {
      items.push({
        id: `${index}:turn_started`,
        kind: 'reasoning',
        title: t('runFlow.reasoningTitle'),
        summary: t('runProgress.turnStartedDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'context_built') {
      items.push({
        id: `${index}:context_built`,
        kind: 'reasoning',
        title: t('runProgress.contextBuilt'),
        summary: t('runProgress.contextBuiltDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'model_stream_started') {
      items.push({
        id: `${index}:model_stream`,
        kind: 'reasoning',
        title: t('runProgress.modelStreaming'),
        summary: t('runFlow.modelStarted', { model: stringValue(payload.model) ?? 'provider' }),
        status: 'running',
        startedAt: timestamp,
        open: true
      });
      streamItemIndex = items.length - 1;
      continue;
    }
    if (event.type === 'model_stream_delta' && streamItemIndex >= 0) {
      const item = items[streamItemIndex];
      if (item) {
        const deltaSummary = streamDeltaSummaryAt(trace, event);
        item.summary = t('runProgress.modelStreamingDetail', {
          count: String(deltaSummary.charCount)
        });
      }
      continue;
    }
    if (event.type === 'model_stream_finished' && streamItemIndex >= 0) {
      const item = items[streamItemIndex];
      if (item) {
        item.status = 'complete';
        item.endedAt = timestamp;
        item.summary = t('runProgress.readingDecisionDetail');
      }
      streamItemIndex = -1;
      continue;
    }
    if (event.type === 'model_stream_failed') {
      const summary = stringValue(payload.summary) ?? t('trace.summary.runFailed');
      const item = streamItemIndex >= 0 ? items[streamItemIndex] : undefined;
      if (item) {
        item.status = 'error';
        item.endedAt = timestamp;
        item.summary = t('runFlow.modelFailed', { summary });
      } else {
        items.push({
          id: `${index}:model_stream_failed`,
          kind: 'reasoning',
          title: t('trace.event.modelFailed'),
          summary: t('runFlow.modelFailed', { summary }),
          status: 'error',
          startedAt: timestamp,
          endedAt: timestamp,
          open: true
        });
      }
      streamItemIndex = -1;
      continue;
    }
    if (event.type === 'model_stream_fallback_started') {
      const reason = stringValue(payload.reason) ?? t('trace.summary.noDetail');
      items.push({
        id: `${index}:model_stream_fallback_started`,
        kind: 'reasoning',
        title: t('runFlow.fallbackTitle'),
        summary: t('runFlow.fallbackDetail', { reason }),
        status: 'running',
        startedAt: timestamp,
        open: true
      });
      continue;
    }
    if (event.type === 'decision_parse_failed') {
      items.push({
        id: `${index}:decision_parse_failed`,
        kind: 'reasoning',
        title: t('runFlow.repairTitle'),
        summary: t('runFlow.repairDetail'),
        status: 'error',
        startedAt: timestamp,
        endedAt: timestamp,
        open: true
      });
      continue;
    }
    if (event.type === 'model_decision') {
      items.push({
        id: `${index}:model_decision`,
        kind: 'reasoning',
        title: t('runProgress.preparingAction'),
        summary: t('runProgress.preparingActionDetail'),
        status: 'complete',
        startedAt: timestamp,
        endedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'tool_started') {
      if (streamItemIndex >= 0) {
        const item = items[streamItemIndex];
        if (item) {
          item.status = 'complete';
          item.endedAt = timestamp;
          item.summary = t('runProgress.readingDecisionDetail');
        }
        streamItemIndex = -1;
      }
      const tool = stringValue(payload.tool) ?? t('trace.event.unknownTool');
      items.push({
        id: `${index}:tool_started:${tool}`,
        kind: 'tool',
        title: tool,
        summary: t('runFlow.toolStarted', { tool }),
        status: 'running',
        startedAt: timestamp,
        open: false
      });
      continue;
    }
    if (event.type === 'tool_result') {
      const tool = stringValue(payload.tool) ?? t('trace.event.unknownTool');
      const pending = findLastPendingToolItem(items, tool);
      const ok = payload.ok !== false;
      const summary = stringValue(payload.summary) ?? stringValue(payload.code) ?? t('trace.summary.toolReturned');
      if (pending) {
        pending.status = ok ? 'complete' : 'error';
        pending.endedAt = timestamp;
        pending.summary = ok
          ? t('trace.summary.toolResultDone', { summary })
          : t('trace.summary.toolResultFailed', { summary });
      } else {
        items.push({
          id: `${index}:tool_result:${tool}`,
          kind: 'tool',
          title: tool,
          summary,
          status: ok ? 'complete' : 'error',
          startedAt: timestamp,
          endedAt: timestamp,
          open: false
        });
      }
    }
  }

  const visibleItems = compactRunFlowItems(items, t);
  const focusIndex = findFocusedRunFlowItemIndex(visibleItems);
  return visibleItems.map((item, index) => ({
    ...item,
    open: index === focusIndex
  }));
}

function compactRunFlowItems(items: RunFlowItem[], t: ReturnType<typeof useT>): RunFlowItem[] {
  const meaningful = items.filter((item) =>
    item.kind === 'tool' ||
    item.title !== t('runFlow.reasoningTitle')
  );
  const focusedIndex = findFocusedRunFlowItemIndex(meaningful);
  if (focusedIndex < 0) {
    return meaningful.slice(-MAX_VISIBLE_RUN_FLOW_ITEMS);
  }
  const start = Math.max(0, focusedIndex - (MAX_VISIBLE_RUN_FLOW_ITEMS - 1));
  return meaningful.slice(start, focusedIndex + 1);
}

function findFocusedRunFlowItemIndex(items: RunFlowItem[]): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const status = items[index]?.status;
    if (status === 'running' || status === 'error') {
      return index;
    }
  }
  return items.length - 1;
}

function findLastTraceIndex(
  trace: NonNullable<RunSnapshot['trace']>,
  predicate: (event: NonNullable<RunSnapshot['trace']>[number]) => boolean
): number {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (event && predicate(event)) {
      return index;
    }
  }
  return -1;
}

function findLastPendingToolItem(items: RunFlowItem[], tool: string): RunFlowItem | undefined {
  return [...items].reverse().find((item) =>
    item.kind === 'tool' &&
    item.title === tool &&
    item.status === 'running'
  );
}

function thinkingProgressFromTrace(trace: NonNullable<RunSnapshot['trace']>, t: ReturnType<typeof useT>): RunProgress {
  const postFillProgress = postFillProgressFromTrace(trace, t);
  if (postFillProgress) {
    return postFillProgress;
  }
  const event = [...trace].reverse().find((item) =>
    item.type === 'turn_started' ||
    item.type === 'tools_selected' ||
    item.type === 'context_built' ||
    item.type === 'model_stream_started' ||
    item.type === 'model_stream_delta' ||
    item.type === 'model_stream_finished' ||
    item.type === 'decision_parse_failed' ||
    item.type === 'model_decision'
  );
  if (event?.type === 'context_built') {
    return {
      label: t('runProgress.contextBuilt'),
      detail: t('runProgress.contextBuiltDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'tools_selected') {
    return {
      label: t('runProgress.toolsSelected'),
      detail: t('runProgress.toolsSelectedDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_finished') {
    const payload = recordPayload(event.payload);
    return {
      label: t('trace.event.modelFinished'),
      detail: t('trace.summary.modelFinished', {
        chars: String(numberValue(payload.charCount) ?? 0)
      }),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_started') {
    const payload = recordPayload(event.payload);
    return {
      label: t('trace.event.modelStarted'),
      detail: t('trace.summary.modelStarted', { model: stringValue(payload.model) ?? 'provider' }),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_stream_delta') {
    const streamStarted = latestEventAtOrBefore(trace, 'model_stream_started', event.timestamp);
    const deltaSummary = streamDeltaSummaryAt(trace, event);
    return {
      label: t('trace.event.modelDelta'),
      detail: t('trace.summary.modelDelta', {
        chunks: String(deltaSummary.chunkCount),
        chars: String(deltaSummary.charCount)
      }),
      startedAt: streamStarted?.timestamp ?? event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'decision_parse_failed') {
    return {
      label: event.type,
      detail: summarizeProgressPayload(recordPayload(event.payload), t),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'model_decision') {
    return {
      label: t('runProgress.preparingAction'),
      detail: t('runProgress.preparingActionDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  if (event?.type === 'turn_started') {
    return {
      label: t('runProgress.turnStarted'),
      detail: t('runProgress.turnStartedDetail'),
      startedAt: event.timestamp ?? Date.now()
    };
  }
  return {
    label: t('runProgress.turnStarted'),
    detail: t('runProgress.turnStartedDetail'),
    startedAt: event?.timestamp ?? Date.now()
  };
}

function streamDeltaSummaryAt(
  trace: NonNullable<RunSnapshot['trace']>,
  currentEvent: NonNullable<RunSnapshot['trace']>[number]
): { chunkCount: number; charCount: number } {
  const currentTimestamp = currentEvent.timestamp ?? Number.POSITIVE_INFINITY;
  let chunkCount = 0;
  let charCount = 0;
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (!event || (event.timestamp ?? 0) > currentTimestamp) {
      continue;
    }
    if (event.type === 'model_stream_delta') {
      chunkCount += 1;
      charCount += numberValue(recordPayload(event.payload).charCount) ?? 0;
      continue;
    }
    if (event.type === 'model_stream_started') {
      break;
    }
    if (chunkCount > 0) {
      break;
    }
  }
  return { chunkCount, charCount };
}

function summarizeProgressPayload(payload: Record<string, unknown>, t: ReturnType<typeof useT>): string {
  const summary = stringValue(payload.summary) ?? stringValue(payload.message);
  if (summary) {
    return summary;
  }
  const keys = Object.keys(payload);
  return keys.length
    ? t('trace.summary.payloadFields', { count: String(keys.length), list: keys.slice(0, 4).join('、') })
    : t('trace.summary.noDetail');
}

function postFillProgressFromTrace(trace: NonNullable<RunSnapshot['trace']>, t: ReturnType<typeof useT>): RunProgress | undefined {
  const latestFillResult = [...trace].reverse().find((event) => {
    if (event.type !== 'tool_result') return false;
    const payload = recordPayload(event.payload);
    const result = recordPayload(payload.result);
    const tool = stringValue(payload.tool) ?? stringValue(result.tool) ?? '';
    const ok = typeof payload.ok === 'boolean' ? payload.ok : result.ok;
    return tool.includes('form_fill') && ok !== false;
  });
  if (!latestFillResult) {
    return undefined;
  }
  const latestVerifyAfterFill = [...trace].reverse().find((event) => {
    if ((event.timestamp ?? 0) <= (latestFillResult.timestamp ?? 0)) return false;
    if (event.type !== 'tool_started' && event.type !== 'tool_result') return false;
    const payload = recordPayload(event.payload);
    const result = recordPayload(payload.result);
    const tool = stringValue(payload.tool) ?? stringValue(result.tool) ?? '';
    return tool.includes('form_verify');
  });
  if (latestVerifyAfterFill) {
    return undefined;
  }
  return {
    label: t('runProgress.confirmingFill'),
    detail: t('runProgress.confirmingFillDetail'),
    startedAt: latestFillResult.timestamp ?? Date.now()
  };
}

function isActiveRunStatus(status: RunSnapshot['status']): boolean {
  return status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'recovering';
}

function humanToolLabel(tool: string, t: ReturnType<typeof useT>): string {
  if (tool.includes('page_observe')) return t('tool.running.observe');
  if (tool.includes('page_read_article')) return t('tool.running.readArticle');
  if (tool.includes('page_read_visible_text')) return t('tool.running.readVisibleText');
  if (tool.includes('iframe_list')) return t('tool.running.iframeList');
  if (tool.includes('iframe_read')) return t('tool.running.iframeRead');
  if (tool.includes('viewport_scroll')) return t('tool.running.viewportScroll');
  if (tool.includes('form_infer_fill_plan')) return t('tool.running.formInferPlan');
  if (tool.includes('form_fill')) return t('tool.running.formFill');
  if (tool.includes('form_verify')) return t('tool.running.formVerify');
  if (tool.includes('form_submit')) return t('tool.running.formSubmit');
  return t('tool.running.default');
}

function recordPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function latestEventAtOrBefore(
  trace: NonNullable<RunSnapshot['trace']>,
  type: string,
  timestamp: number | undefined
): NonNullable<RunSnapshot['trace']>[number] | undefined {
  return [...trace].reverse().find((event) =>
    event.type === type &&
    (timestamp === undefined || (event.timestamp ?? 0) <= timestamp)
  );
}

function useNowTick(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function fallbackMessages(
  snapshot: RunSnapshot | undefined,
  t: ReturnType<typeof useT>,
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

function iconForMessage(message: AgentMessage) {
  if (message.role === 'user') {
    return <UserRound size={16} />;
  }
  if (message.kind === 'error') {
    return <AlertCircle size={16} />;
  }
  if (message.kind === 'page_summary') {
    return <FileText size={16} />;
  }
  if (message.kind === 'recommendation') {
    return <AlertCircle size={16} />;
  }
  if (message.kind === 'diagnosis') {
    return <CheckCircle2 size={16} />;
  }
  return <Bot size={16} />;
}

function countSummaryText(text: string | undefined): number {
  const normalized = text?.trim();
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/u).filter(Boolean).length;
}

function countLinks(snapshot: RunSnapshot | undefined): number {
  const refs = snapshot?.structuredPageData?.refs.items ?? snapshot?.refs ?? [];
  return refs.filter((ref) =>
    ref.role === 'link' || ref.tagName.toLowerCase() === 'a'
  ).length;
}

function domainFromSummary(text: string): string | undefined {
  const match = text.match(/来源：([^。\n]+)。|Source: ([^.\n]+)\./u);
  return match?.[1] ?? match?.[2];
}

function formatMessageTime(value: number | string): string {
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(startedAt: number, endedAt: number): string {
  return `${Math.max(0, endedAt - startedAt)} ms`;
}

function DebugReportSummary({ report }: { report: DebugReport }) {
  const t = useT();
  const findings = report.findings.slice(0, 3);
  const confidenceLabels = {
    high: t('diagnosis.confidence.high'),
    medium: t('diagnosis.confidence.medium'),
    low: t('diagnosis.confidence.low')
  } as const;
  const sourceLabels = {
    observation: t('diagnosis.source.observation'),
    form: t('diagnosis.source.form'),
    debug: t('diagnosis.source.debug'),
    tool_result: t('diagnosis.source.toolResult'),
    user: t('diagnosis.source.user')
  } as const;
  return (
    <div className="bh-debugReportSummary" aria-label={t('diagnosis.summaryAria')}>
      {findings.map((finding, index) => (
        <article key={`${finding.title}:${index}`}>
          <header>
            <strong>{finding.title}</strong>
            <span>{confidenceLabels[finding.confidence]}</span>
          </header>
          <p>{finding.explanation}</p>
          <ul>
            {finding.evidence.slice(0, 2).map((evidence, evidenceIndex) => (
              <li key={`${finding.title}:evidence:${evidenceIndex}`}>
                {sourceLabels[evidence.source]}: {evidence.summary}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {report.limitations?.length ? (
        <p className="bh-reportLimitations">
          {t('diagnosis.limitations', { items: report.limitations.slice(0, 2).join('; ') })}
        </p>
      ) : null}
    </div>
  );
}
