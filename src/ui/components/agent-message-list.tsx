import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Link,
  LoaderCircle,
  UserRound
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
};

export function AgentMessageList({ snapshot }: AgentMessageListProps) {
  const t = useT();
  const locale = useLocale();
  const waterfallRef = useRef<HTMLElement>(null);
  const hasRuntimeMessages = Boolean(snapshot?.messages?.length);
  const baseMessages = hasRuntimeMessages ? snapshot?.messages ?? [] : fallbackMessages(snapshot, t, locale);
  const rawMessages = snapshot
    ? withDerivedPageSummary(baseMessages, snapshot, t, locale)
    : baseMessages;
  const messages = prepareDisplayMessages(rawMessages);
  const progress = buildRunProgress(snapshot, t);
  const nowTick = useNowTick(Boolean(progress));
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
    scrollToBottom();
  }, [scrollAnchor, scrollToBottom]);

  // streaming 高频更新时用 ResizeObserver 兜底，确保内容高度增长时自动跟随
  useEffect(() => {
    const container = waterfallRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      // 用户在手动上翻时不强制滚动
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom <= 32) {
        scrollToBottom();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  return (
    <section ref={waterfallRef} className="bh-agentWaterfall" aria-label={t('messageList.aria')}>
      {messages.map((message) => (
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
          </div>
        </article>
      ))}
      {snapshot?.toolResult && snapshot.toolResult.tool.startsWith('bh_form_') ? (
        <FormActionCard toolResult={snapshot.toolResult} snapshot={snapshot} />
      ) : null}
      {progress ? <RunProgressCard progress={progress} now={nowTick} /> : null}
    </section>
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
  return placePageSummaryAfterTask(filtered);
}

function placePageSummaryAfterTask(messages: AgentMessage[]): AgentMessage[] {
  const pageSummaryIndex = messages.findIndex((message) => message.kind === 'page_summary');
  if (pageSummaryIndex < 0) {
    return messages;
  }
  const pageSummary = messages[pageSummaryIndex];
  if (!pageSummary) {
    return messages;
  }
  const pageSummaryRunId = runIdFromMessageId(pageSummary.id);
  const withoutPageSummary = messages.filter((_, index) => index !== pageSummaryIndex);
  const lastTaskIndex = withoutPageSummary.reduce(
    (lastIndex, message, index) =>
      message.kind === 'task' && runIdFromMessageId(message.id) === pageSummaryRunId
        ? index
        : lastIndex,
    -1
  );
  if (lastTaskIndex < 0) {
    return messages;
  }
  const insertAt = lastTaskIndex + 1;
  return [
    ...withoutPageSummary.slice(0, insertAt),
    pageSummary,
    ...withoutPageSummary.slice(insertAt)
  ];
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
      nextMessages.push({
        id: `${snapshot.runId}:derived-page-summary`,
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

function isRawAgentDecision(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as { type?: unknown };
    return parsed.type === 'tool_call' ||
      parsed.type === 'finish' ||
      parsed.type === 'ask_user' ||
      parsed.type === 'fail';
  } catch {
    return false;
  }
}

type RunProgress = {
  label: string;
  detail: string;
  startedAt: number;
};

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
      <span className="bh-runProgressSpinner" aria-hidden="true">
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
  const latestModelStarted = [...trace].reverse().find((event) => event.type === 'model_stream_started');
  if (snapshot.status === 'thinking' || latestModelStarted) {
    return {
      label: t('runProgress.thinking'),
      detail: t('runProgress.thinkingDetail'),
      startedAt: latestModelStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'executing_tool' && latestToolStarted) {
    const payload = recordPayload(latestToolStarted.payload);
    const tool = stringValue(payload.tool) ?? '';
    return {
      label: humanToolLabel(tool, t),
      detail: t('runProgress.executingDetail', { tool }),
      startedAt: latestToolStarted.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'observing') {
    return {
      label: t('runProgress.observing'),
      detail: t('runProgress.observingDetail'),
      startedAt: latestToolStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'waiting_for_user') {
    return {
      label: t('runProgress.waitingUser'),
      detail: t('runProgress.waitingUserDetail'),
      startedAt: Date.now()
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

function isActiveRunStatus(status: RunSnapshot['status']): boolean {
  return status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'waiting_for_user' ||
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
