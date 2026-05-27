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
import { useEffect, useRef, useState } from 'react';

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
  const waterfallRef = useRef<HTMLElement>(null);
  const hasRuntimeMessages = Boolean(snapshot?.messages?.length);
  const baseMessages = hasRuntimeMessages ? snapshot?.messages ?? [] : fallbackMessages(snapshot);
  const rawMessages = snapshot
    ? withDerivedPageSummary(baseMessages, snapshot)
    : baseMessages;
  const messages = prepareDisplayMessages(rawMessages);
  const progress = buildRunProgress(snapshot);
  const nowTick = useNowTick(Boolean(progress));
  const scrollAnchor = messages
    .map((message) =>
      `${message.id}:${message.status}:${message.updatedAt}:${message.content.length}`
    )
    .join('|') + (progress ? `|progress:${progress.label}:${nowTick}` : '');

  useEffect(() => {
    if (waterfallRef.current) {
      waterfallRef.current.scrollTop = waterfallRef.current.scrollHeight;
    }
  }, [scrollAnchor]);

  return (
    <section ref={waterfallRef} className="bh-agentWaterfall" aria-label="BrowserHelm Agent 消息">
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
            {message.kind === 'page_summary' ? (
              <PageObservationCard message={message} snapshot={snapshot} />
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
              <p>等待 BrowserHelm 输出...</p>
            )}
            {message.kind === 'diagnosis' && snapshot?.debugReport ? (
              <DebugReportSummary report={snapshot.debugReport} />
            ) : null}
            {message.status === 'streaming' ? <span className="bh-streamingDots">生成中</span> : null}
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
  if (lastPageSummaryIndex < 0) {
    return messages;
  }
  return messages.filter((message, index) => {
    if (message.kind === 'page_summary') {
      return index === lastPageSummaryIndex;
    }
    const isCompletedObserveStatus =
      message.id.endsWith(':observe-status') && message.status === 'complete';
    return !isCompletedObserveStatus;
  });
}

function PageObservationCard({
  message,
  snapshot
}: {
  message: AgentMessage;
  snapshot?: RunSnapshot | undefined;
}) {
  const observation = snapshot?.structuredPageData?.observation.items[0];
  const currentDomain =
    observation?.currentDomain ??
    snapshot?.observation?.currentDomain ??
    domainFromSummary(message.content) ??
    '当前页面';
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
        <h2>已完成页面观察</h2>
        {updatedAt ? <time>{formatMessageTime(updatedAt)}</time> : null}
        <ChevronDown size={17} aria-hidden="true" />
      </header>
      <div className="bh-pageObservationBody">
        <p>
          <strong>当前页面：</strong>
          {url ? <span title={url}>{currentDomain}</span> : currentDomain}
        </p>
        <StreamingMarkdown content={message.content} className="bh-markdownContent" />
      </div>
      <ul className="bh-pageObservationStats" aria-label="页面观察统计">
        <li><FileText size={15} />文本 {textCount}</li>
        <li><Link size={15} />链接 {linkCount}</li>
        <li><FileText size={15} />表单 {formCount}</li>
      </ul>
    </section>
  );
}

function withDerivedPageSummary(messages: AgentMessage[], snapshot: RunSnapshot): AgentMessage[] {
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
    });
    if (summary || item || snapshot.observation) {
      const title = item?.title ?? snapshot.observation?.title ?? '页面摘要';
      nextMessages.push({
        id: `${snapshot.runId}:derived-page-summary`,
        role: 'agent',
        kind: 'page_summary',
        status: 'complete',
        title,
        content: summary || '当前页面已完成只读观察。',
        createdAt: 0,
        updatedAt: 0
      });
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
      content: findingText || '暂未发现高置信度问题。',
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
        title: '建议',
        content: recommendationText,
        createdAt: 0,
        updatedAt: 0
      });
    }
  }
  return nextMessages;
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

function buildRunProgress(snapshot: RunSnapshot | undefined): RunProgress | undefined {
  if (!snapshot || !isActiveRunStatus(snapshot.status)) {
    return undefined;
  }
  const trace = snapshot.trace ?? [];
  const latestToolStarted = [...trace].reverse().find((event) => event.type === 'tool_started');
  const latestModelStarted = [...trace].reverse().find((event) => event.type === 'model_stream_started');
  if (snapshot.status === 'thinking' || latestModelStarted) {
    return {
      label: '正在思考下一步',
      detail: 'BrowserHelm 正在结合页面观察、历史对话和工具结果组织回复。',
      startedAt: latestModelStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'executing_tool' && latestToolStarted) {
    const payload = recordPayload(latestToolStarted.payload);
    const tool = stringValue(payload.tool) ?? '工具';
    return {
      label: humanToolLabel(tool),
      detail: `正在运行 ${tool}，完成后会自动更新卡片和调试信息。`,
      startedAt: latestToolStarted.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'observing') {
    return {
      label: '正在观察当前页面',
      detail: '正在读取标题、正文摘要、链接、表单和可交互元素。',
      startedAt: latestToolStarted?.timestamp ?? Date.now()
    };
  }
  if (snapshot.status === 'waiting_for_user') {
    return {
      label: '等待你的补充',
      detail: 'Agent 需要更多信息才能继续。',
      startedAt: Date.now()
    };
  }
  if (snapshot.status === 'recovering') {
    return {
      label: '正在恢复运行',
      detail: '正在根据错误信息选择下一步。',
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

function humanToolLabel(tool: string): string {
  if (tool.includes('page_observe')) return '正在观察页面结构';
  if (tool.includes('page_read_article')) return '正在读取页面正文';
  if (tool.includes('page_read_visible_text')) return '正在读取可见文本';
  if (tool.includes('iframe_list')) return '正在查找 iframe';
  if (tool.includes('iframe_read')) return '正在读取 iframe 内容';
  if (tool.includes('viewport_scroll')) return '正在滚动页面';
  if (tool.includes('form_infer_fill_plan')) return '正在规划表单填写';
  if (tool.includes('form_fill')) return '正在填写表单字段';
  if (tool.includes('form_verify')) return '正在验证表单状态';
  if (tool.includes('form_submit')) return '正在准备提交确认';
  return '正在运行页面工具';
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

function fallbackMessages(snapshot: RunSnapshot | undefined): AgentMessage[] {
  if (!snapshot) {
    return [
      {
        id: 'empty-welcome',
        role: 'agent',
        kind: 'agent_status',
        status: 'complete',
        title: '准备观察当前页面',
        content: 'BrowserHelm 会先读取页面摘要，再根据你的任务继续诊断。',
        createdAt: 0,
        updatedAt: 0
      }
    ];
  }
  const content = snapshot.error?.message ??
    snapshot.debugReport?.title ??
    (snapshot.observation ? buildUserFacingPageSummary(snapshot.observation) : undefined) ??
    'BrowserHelm 已准备好继续检查当前页面。';
  return [
    {
      id: `${snapshot.runId}:fallback`,
      role: 'agent',
      kind: snapshot.error ? 'error' : 'agent_status',
      status: snapshot.error ? 'error' : 'complete',
      title: snapshot.error ? '运行遇到问题' : '页面状态',
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
  const match = text.match(/来源：([^。\n]+)。/u);
  return match?.[1];
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
  const findings = report.findings.slice(0, 3);
  return (
    <div className="bh-debugReportSummary" aria-label="诊断证据摘要">
      {findings.map((finding, index) => (
        <article key={`${finding.title}:${index}`}>
          <header>
            <strong>{finding.title}</strong>
            <span>{confidenceLabel(finding.confidence)}</span>
          </header>
          <p>{finding.explanation}</p>
          <ul>
            {finding.evidence.slice(0, 2).map((evidence, evidenceIndex) => (
              <li key={`${finding.title}:evidence:${evidenceIndex}`}>
                {sourceLabel(evidence.source)}：{evidence.summary}
              </li>
            ))}
          </ul>
        </article>
      ))}
      {report.limitations?.length ? (
        <p className="bh-reportLimitations">
          限制：{report.limitations.slice(0, 2).join('；')}
        </p>
      ) : null}
    </div>
  );
}

function confidenceLabel(confidence: DebugReport['findings'][number]['confidence']): string {
  return {
    high: '高信心',
    medium: '中等信心',
    low: '低信心'
  }[confidence];
}

function sourceLabel(source: DebugReport['findings'][number]['evidence'][number]['source']): string {
  return {
    observation: '页面观察',
    form: '表单',
    debug: '调试信号',
    tool_result: '工具结果',
    user: '用户输入'
  }[source];
}
