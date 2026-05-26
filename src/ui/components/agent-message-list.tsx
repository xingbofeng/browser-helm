import { AlertCircle, Bot, CheckCircle2, FileText, UserRound } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { RunSnapshot } from '../../runtime/runtime-messages';
import { buildUserFacingPageSummary } from '../../shared/page-summary';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { DebugReport } from '../../shared/schemas/diagnosis.schema';
import { StreamingMarkdown } from './streaming-markdown';

type AgentMessageListProps = {
  snapshot?: RunSnapshot | undefined;
};

export function AgentMessageList({ snapshot }: AgentMessageListProps) {
  const waterfallRef = useRef<HTMLElement>(null);
  const hasRuntimeMessages = Boolean(snapshot?.messages?.length);
  const baseMessages = hasRuntimeMessages ? snapshot?.messages ?? [] : fallbackMessages(snapshot);
  const messages = snapshot && !hasRuntimeMessages
    ? withDerivedPageSummary(baseMessages, snapshot)
    : baseMessages;
  const scrollAnchor = messages
    .map((message) =>
      `${message.id}:${message.status}:${message.updatedAt}:${message.content.length}`
    )
    .join('|');

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
            {message.title ? <h2>{message.title}</h2> : null}
            {message.role === 'agent' && message.content ? (
              <StreamingMarkdown content={message.content} className="bh-markdownContent" />
            ) : message.content ? (
              <p>{message.content}</p>
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
