import { describe, expect, it } from 'vitest';

import { buildMessages } from '../../../../src/agent/loop/prompt-builder';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';
import { defaultMemoryRepo } from '../../../../src/storage/memory-repo';
import { defaultScratchpadRepo } from '../../../../src/storage/scratchpad-repo';
import { defaultWorkflowRepo } from '../../../../src/storage/workflow-repo';

describe('runtime prompt builder', () => {
  it('keeps page read text in prompt even when page context is large', () => {
    const importantSentence = '重要正文在摘要之外：这篇文章主要解释如何注册尼日利亚区 Apple ID 并用于订阅 Claude Pro。';
    const messages = buildMessages({
      record: recordWithTrace([]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_READ_ARTICLE),
        observation: {
          url: 'https://x.com/example/status/1',
          title: 'Large X page',
          currentDomain: 'x.com',
          origin: 'https://x.com',
          visibleTextSummary: '导航 '.repeat(6_000),
          pageStateSummary: 'x.com conversation page',
          interactiveCount: 298,
          warnings: ['VISIBLE_TEXT_TRUNCATED']
        },
        structuredPageData: {
          observation: tabData('large observation', [{
            url: 'https://x.com/example/status/1',
            title: 'Large X page',
            currentDomain: 'x.com',
            origin: 'https://x.com',
            visibleTextSummary: '导航 '.repeat(6_000),
            pageStateSummary: 'x.com conversation page'
          }]),
          refs: tabData('many refs', Array.from({ length: 80 }, (_, index) => ({
            refId: `ref_${index}`,
            role: 'link',
            name: `navigation item ${index} ${'noise '.repeat(60)}`,
            tagName: 'a',
            visible: true
          }))),
          interactive: tabData('many items', []),
          forms: tabData('no forms', [])
        },
        toolResult: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: `Read article (truncated): ${'开头噪声'.repeat(30)}`,
          detail: {
            data: {
              text: `${'开头噪声'.repeat(80)} ${importantSentence}`,
              cursor: 0,
              nextCursor: 5000,
              hasMore: true,
              totalTextLength: 9000,
              warnings: ['VISIBLE_TEXT_TRUNCATED'],
              contentSource: 'article'
            }
          },
          changedPage: false,
          requiresObserve: false
        }
      },
      toolsContracts: [
        toolContract(TOOL_NAMES.PAGE_READ_ARTICLE)
      ],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain(importantSentence);
    expect(prompt).toContain('nextCursor');
  });

  it('adds loop guard guidance after repeated page content reads without page changes', () => {
    const messages = buildMessages({
      record: recordWithTrace([
        ...toolRead(TOOL_NAMES.PAGE_READ_VISIBLE_TEXT, { maxChars: 50_000 }, 'Read visible text: article A'),
        ...toolRead(TOOL_NAMES.PAGE_READ_ARTICLE, { includeHeadings: true }, 'Read article: article A'),
        ...toolRead(TOOL_NAMES.PAGE_READ_ARTICLE, { maxChars: 5_000 }, 'Read article: article A')
      ]),
      snapshot: snapshotWithLastToolResult(TOOL_NAMES.PAGE_READ_ARTICLE),
      toolsContracts: [
        toolContract(TOOL_NAMES.PAGE_READ_VISIBLE_TEXT),
        toolContract(TOOL_NAMES.PAGE_READ_ARTICLE)
      ],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('loopGuard');
    expect(prompt).toContain('Potential repeated tool loop detected');
    expect(prompt).toContain('finish');
    expect(prompt).toContain(TOOL_NAMES.PAGE_READ_ARTICLE);
  });

  it('adds read-only boundary guidance after an action readiness check', () => {
    const messages = buildMessages({
      record: recordWithTrace([]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.ACTION_CHECK_READINESS),
        toolResult: {
          tool: TOOL_NAMES.ACTION_CHECK_READINESS,
          ok: true,
          code: 'OK',
          summary: 'Action target is ready; no action was executed',
          detail: {
            data: {
              canAct: true,
              code: 'OK',
              reason: 'Action target is ready',
              risk: 'high',
              staleRefs: false,
              changedPage: false,
              requiresObserve: false,
              wouldRequireApproval: true,
              target: {
                refId: 'ref_quickstart',
                role: 'link',
                name: 'Quickstart',
                tagName: 'a'
              }
            }
          },
          changedPage: false,
          requiresObserve: false
        }
      },
      toolsContracts: [
        toolContract(TOOL_NAMES.ACTION_CHECK_READINESS)
      ],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('actionReadiness');
    expect(prompt).toContain('did not execute');
    expect(prompt).toContain('Do not repeat bh_action_check_readiness');
  });

  it('does not add loop guard guidance when the page changed between reads', () => {
    const messages = buildMessages({
      record: recordWithTrace([
        ...toolRead(TOOL_NAMES.PAGE_READ_VISIBLE_TEXT, { maxChars: 50_000 }, 'Read visible text: article A'),
        ...toolRead(TOOL_NAMES.VIEWPORT_SCROLL, { direction: 'down' }, 'Scrolled', true),
        ...toolRead(TOOL_NAMES.PAGE_READ_ARTICLE, { includeHeadings: true }, 'Read article: article B')
      ]),
      snapshot: snapshotWithLastToolResult(TOOL_NAMES.PAGE_READ_ARTICLE),
      toolsContracts: [
        toolContract(TOOL_NAMES.PAGE_READ_VISIBLE_TEXT),
        toolContract(TOOL_NAMES.PAGE_READ_ARTICLE),
        toolContract(TOOL_NAMES.VIEWPORT_SCROLL)
      ],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).not.toContain('loopGuard');
  });

  it('injects memory hits and scratchpad only through the dynamic suffix', () => {
    const domain = `memory-${Date.now()}.example.com`;
    defaultMemoryRepo.save({
      domain,
      task: '分析账单报表',
      summary: '账单报表入口在 Billing > Invoices'
    });
    defaultWorkflowRepo.save({
      domain,
      intent: '打开账单报表',
      taskDescription: '进入 Billing 后打开 Invoices',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: '观察页面',
        risk: 'safe',
        requiresApproval: false
      }]
    });
    defaultScratchpadRepo.replace('run_test', '已经确认报表使用 Billing 菜单。');

    const messages = buildMessages({
      record: {
        ...recordWithTrace([]),
        task: '分析账单报表'
      },
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: `https://${domain}/dashboard`,
          title: 'Dashboard',
          currentDomain: domain,
          origin: `https://${domain}`,
          visibleTextSummary: 'Dashboard',
          pageStateSummary: 'Ready',
          interactiveCount: 2,
          warnings: []
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_OBSERVE)],
      locale: 'zh'
    });

    expect(messages[0]?.content).not.toContain('Billing > Invoices');
    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('memoryContext');
    expect(prompt).toContain('Billing > Invoices');
    expect(prompt).toContain('打开账单报表');
    expect(prompt).toContain('已经确认报表使用 Billing 菜单。');
  });

  it('does not inject memory hits for restricted domains', () => {
    const domain = 'secure.bank.example';
    defaultMemoryRepo.save({
      domain,
      task: '查看余额',
      summary: 'Sensitive banking memory'
    });

    const messages = buildMessages({
      record: {
        ...recordWithTrace([]),
        task: '查看余额'
      },
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: `https://${domain}/login`,
          title: 'Bank',
          currentDomain: domain,
          origin: `https://${domain}`,
          visibleTextSummary: 'Bank',
          pageStateSummary: 'Ready',
          interactiveCount: 1,
          warnings: []
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_OBSERVE)],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('DOMAIN_RESTRICTED');
    expect(prompt).not.toContain('Sensitive banking memory');
  });
});

function recordWithTrace(trace: RuntimeEvent[]): RunRecord {
  return {
    task: '分析下这篇文章',
    mode: 'ask',
    trace,
    locale: 'zh'
  };
}

function snapshotWithLastToolResult(tool: string): RunSnapshot {
  return {
    runId: 'run_test',
    mode: 'ask',
    status: 'thinking',
    toolResult: {
      tool,
      ok: true,
      code: 'OK',
      summary: 'Read article: article A',
      changedPage: false,
      requiresObserve: false
    },
    trace: []
  };
}

function toolRead(
  tool: string,
  args: Record<string, unknown>,
  summary: string,
  changedPage = false
): RuntimeEvent[] {
  return [
    {
      runId: 'run_test',
      type: TRACE_EVENT_NAMES.TOOL_STARTED,
      payload: { tool, args }
    },
    {
      runId: 'run_test',
      type: TRACE_EVENT_NAMES.TOOL_RESULT,
      payload: {
        tool,
        ok: true,
        code: 'OK',
        summary,
        changedPage,
        requiresObserve: false
      }
    }
  ];
}

function toolContract(name: string): ToolPromptContract {
  return {
    name,
    title: name,
    description: `${name} description`,
    modes: ['ask', 'act'],
    risk: 'safe' as const,
    argsSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true
    },
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary' as const
  };
}

function tabData<T>(summary: string, items: T[]) {
  return {
    status: 'ready' as const,
    summary,
    count: items.length,
    items,
    updatedAt: '2026-05-29T00:00:00.000Z',
    warnings: []
  };
}
