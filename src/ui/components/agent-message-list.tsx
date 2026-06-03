import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link,
  UserRound
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { useLocale, useT } from '../../i18n/context';

import type { RunSnapshot } from '../../runtime/runtime-messages';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { DebugReport } from '../../shared/schemas/diagnosis.schema';
import {
  countLinks,
  countSummaryText,
  currentAgentReplyMessageIndex,
  domainFromSummary,
  fallbackMessages,
  isModeSwitchRequest,
  lastFinalAnswerMessageIndex,
  prepareDisplayMessages,
  shouldShowReplyStatus,
  withDerivedPageSummary
} from './agent-message-derivations';
import { StreamingMarkdown } from './streaming-markdown';
import { FormActionCard } from './form-action-card';
import {
  buildRunFlowItems,
  buildRunProgress,
  RunFlowTimeline,
  RunProgressCard
} from './run-flow-status';

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
  const stateSignals = buildPageAcceptanceSignals(snapshot, t);
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
        {stateSignals.map((signal) => (
          <li key={signal.key} className={`bh-pageObservationSignal bh-pageObservationSignal-${signal.tone}`}>
            {signal.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {signal.label}
          </li>
        ))}
      </ul>
    </section>
  );
}

function buildPageAcceptanceSignals(
  snapshot: RunSnapshot | undefined,
  t: ReturnType<typeof useT>
): Array<{ key: string; label: string; tone: 'ok' | 'warn' }> {
  const signals: Array<{ key: string; label: string; tone: 'ok' | 'warn' }> = [];
  const fields = snapshot?.structuredPageData?.forms.items ?? [];
  if (snapshot?.structuredPageData) {
    const invalidCount = fields.filter((field) => field.validation?.valid === false).length;
    const hasDisabledSubmit = fields.some((field) => field.submit?.disabled);
    if (fields.length === 0) {
      signals.push({ key: 'no-form', label: t('page.state.noForm'), tone: 'ok' });
    } else if (invalidCount === 0 && !hasDisabledSubmit) {
      signals.push({ key: 'valid-form', label: t('page.state.validForm'), tone: 'ok' });
    } else {
      if (invalidCount > 0) {
        signals.push({
          key: 'invalid-form',
          label: t('page.state.invalidForm', { count: String(invalidCount) }),
          tone: 'warn'
        });
      }
      if (hasDisabledSubmit) {
        signals.push({ key: 'disabled-submit', label: t('page.state.disabledSubmit'), tone: 'warn' });
      }
    }
  }

  const pageHealth = readPageHealthToolData(snapshot);
  const consoleErrors = readArrayCount(pageHealth, 'consoleErrors');
  const networkFailures = readArrayCount(pageHealth, 'networkFailures');
  if (consoleErrors > 0) {
    signals.push({
      key: 'console-errors',
      label: t('page.state.consoleErrors', { count: String(consoleErrors) }),
      tone: 'warn'
    });
  }
  if (networkFailures > 0) {
    signals.push({
      key: 'network-failures',
      label: t('page.state.networkFailures', { count: String(networkFailures) }),
      tone: 'warn'
    });
  }
  return signals;
}

function readPageHealthToolData(snapshot: RunSnapshot | undefined): Record<string, unknown> | undefined {
  const toolResult = snapshot?.toolResult;
  if (toolResult?.tool !== TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH) {
    return undefined;
  }
  const detail = toolResult.detail;
  if (typeof detail !== 'object' || detail === null || !('data' in detail)) {
    return undefined;
  }
  const data = (detail as { data?: unknown }).data;
  return typeof data === 'object' && data !== null ? data as Record<string, unknown> : undefined;
}

function readArrayCount(record: Record<string, unknown> | undefined, key: string): number {
  const value = record?.[key];
  return Array.isArray(value) ? value.length : 0;
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
