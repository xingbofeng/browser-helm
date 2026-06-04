import { beforeEach, describe, expect, it } from 'vitest';

import { buildMessages } from '../../../../src/agent/loop/prompt-builder';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RunSnapshot, RuntimeEvent } from '../../../../src/runtime/runtime-messages';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';
import { defaultMemoryRepo } from '../../../../src/storage/memory-repo';
import { defaultScratchpadRepo } from '../../../../src/storage/scratchpad-repo';
import { defaultWorkflowRepo } from '../../../../src/storage/workflow-repo';
import { defaultDomainAdapterPreferences } from '../../../../src/adapters/preferences';

describe('runtime prompt builder', () => {
  beforeEach(() => {
    defaultDomainAdapterPreferences.clear();
  });

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

  it('trims interactive structured data items before building the prompt', () => {
    const interactiveItems = Array.from({ length: 80 }, (_, index) => ({
      refId: `ref_interactive_${index}`,
      role: 'button',
      name: `Action ${index}`,
      tagName: 'button',
      visible: true,
      disabled: false,
      domOrder: index,
      zone: 'main',
      warnings: []
    }));
    const messages = buildMessages({
      record: recordWithTrace([]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        structuredPageData: {
          observation: tabData('observation', []),
          refs: tabData('refs', []),
          interactive: tabData('many interactive items', interactiveItems),
          forms: tabData('forms', [])
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_OBSERVE)],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    const jsonStart = prompt.indexOf('{');
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(prompt.slice(jsonStart)) as {
      structuredPageData: {
        interactive: {
          count: number;
          items: Array<{ refId: string }>;
          omittedCount: number;
        };
      };
    };

    expect(parsed.structuredPageData.interactive.count).toBe(80);
    expect(parsed.structuredPageData.interactive.items).toHaveLength(50);
    expect(parsed.structuredPageData.interactive.items.at(-1)?.refId).toBe('ref_interactive_49');
    expect(parsed.structuredPageData.interactive.omittedCount).toBe(30);
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

  it('adds bounded vision evidence only after an explicit vision tool result', () => {
    const messages = buildMessages({
      record: recordWithTrace([]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.VISION_DETECT_OVERLAY),
        toolResult: {
          tool: TOOL_NAMES.VISION_DETECT_OVERLAY,
          ok: true,
          code: 'OK',
          summary: 'Vision observation: cookie banner overlaps checkout button',
          detail: {
            data: {
              screenshot: {
                id: 'shot_secret',
                tabId: 42,
                mode: 'viewport',
                mimeType: 'image/png',
                width: 1280,
                height: 720,
                dataUrl: 'data:image/png;base64,SHOULD_NOT_REACH_PROMPT',
                captureSource: 'tabs_capture_visible_tab',
                capturedAt: 123,
                traceSafe: false
              },
              observation: {
                imageRef: 'shot_secret',
                summary: 'cookie banner overlaps checkout button',
                visibleText: ['Checkout', 'Accept cookies'],
                blockers: ['cookie banner overlaps checkout button'],
                layoutIssues: ['primary CTA shifted below fold'],
                fallback: 'none',
                confidence: 0.82,
                grounding: [
                  {
                    claim: 'cookie banner overlaps checkout button',
                    source: 'dom_backed',
                    confidence: 'high',
                    evidence: [{ kind: 'dom_text', text: 'Accept cookies' }]
                  }
                ],
                pointerFallback: {
                  allowed: false,
                  targetConfidence: 'medium',
                  domRefUnavailable: false,
                  reason: 'DOM-backed click target is available.'
                }
              }
            }
          },
          changedPage: false,
          requiresObserve: false
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.VISION_DETECT_OVERLAY)],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    const jsonStart = prompt.indexOf('{');
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(prompt.slice(jsonStart)) as {
      visionEvidence?: {
        summary: string;
        screenshot: { mode: string; width: number; height: number };
        grounding: Array<{ claim: string; source: string; evidence: Array<{ text?: string }> }>;
      };
    };

    expect(parsed.visionEvidence).toMatchObject({
      summary: 'cookie banner overlaps checkout button',
      screenshot: {
        mode: 'viewport',
        width: 1280,
        height: 720
      },
      grounding: [{
        claim: 'cookie banner overlaps checkout button',
        source: 'dom_backed',
        evidence: [{ text: 'Accept cookies' }]
      }]
    });
    expect(prompt).not.toContain('SHOULD_NOT_REACH_PROMPT');
    expect(prompt).not.toContain('data:image');
  });

  it('does not add vision evidence from the default page observation path', () => {
    const messages = buildMessages({
      record: recordWithTrace([]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: 'https://example.com/checkout',
          title: 'Checkout',
          currentDomain: 'example.com',
          origin: 'https://example.com',
          visibleTextSummary: 'Visible page says cookie banner overlaps checkout button.',
          pageStateSummary: 'Ready',
          interactiveCount: 3,
          warnings: []
        },
        toolResult: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Page observed: cookie banner overlaps checkout button',
          detail: {
            data: {
              observation: {
                summary: 'This shape resembles a vision observation but was not produced by a vision tool.',
                blockers: ['cookie banner overlaps checkout button']
              }
            }
          },
          changedPage: false,
          requiresObserve: false
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_OBSERVE)],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    const parsed = JSON.parse(prompt) as { visionEvidence?: unknown; observation?: { visibleTextSummary?: string } };

    expect(parsed.visionEvidence).toBeUndefined();
    expect(parsed.observation?.visibleTextSummary).toContain('cookie banner overlaps checkout button');
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

  it('injects detected domain adapter guidance and workflows into the dynamic suffix', () => {
    const messages = buildMessages({
      record: {
        ...recordWithTrace([]),
        task: '帮我查看这个 GitHub 仓库的 issue'
      },
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: 'https://github.com/openai/browser-helm/issues',
          title: 'Issues',
          currentDomain: 'github.com',
          origin: 'https://github.com',
          visibleTextSummary: 'Issues',
          pageStateSummary: 'Ready',
          interactiveCount: 8,
          warnings: []
        }
      },
      toolsContracts: [
        toolContract(TOOL_NAMES.PAGE_OBSERVE),
        toolContract(TOOL_NAMES.ADAPTER_DETECT_SITE)
      ],
      locale: 'zh'
    });

    expect(messages[0]?.content).not.toContain('github-open-issue');
    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('domainAdapter');
    expect(prompt).toContain('GitHub');
    expect(prompt).toContain('github-open-issue');
    expect(prompt).toContain('never bypasses global approval policy');
  });

  it('falls back to generic adapter context when the matched adapter is disabled', () => {
    defaultDomainAdapterPreferences.setEnabled('github', false);

    const messages = buildMessages({
      record: {
        ...recordWithTrace([]),
        task: '帮我查看这个 GitHub 仓库的 issue'
      },
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: 'https://github.com/openai/browser-helm/issues',
          title: 'Issues',
          currentDomain: 'github.com',
          origin: 'https://github.com',
          visibleTextSummary: 'Issues',
          pageStateSummary: 'Ready',
          interactiveCount: 8,
          warnings: []
        }
      },
      toolsContracts: [
        toolContract(TOOL_NAMES.PAGE_OBSERVE),
        toolContract(TOOL_NAMES.ADAPTER_DETECT_SITE)
      ],
      locale: 'zh'
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('generic_browser_tools');
    expect(prompt).toContain('GitHub adapter disabled by user');
    expect(prompt).not.toContain('github-open-issue');
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

  it('does not inject memory or workflow hits for domains outside the explicit domain policy', () => {
    const domain = `policy-blocked-${Date.now()}.example.com`;
    defaultMemoryRepo.save({
      domain,
      task: '查看账单',
      summary: 'Policy gated billing memory'
    });
    defaultWorkflowRepo.save({
      domain,
      intent: '打开账单',
      taskDescription: '进入 Billing',
      steps: [{
        id: 'step_1',
        tool: TOOL_NAMES.PAGE_OBSERVE,
        summary: '观察页面',
        risk: 'safe',
        requiresApproval: false
      }]
    });

    const messages = buildMessages({
      record: {
        ...recordWithTrace([]),
        task: '查看账单'
      },
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_OBSERVE),
        observation: {
          url: `https://${domain}/billing`,
          title: 'Billing',
          currentDomain: domain,
          origin: `https://${domain}`,
          visibleTextSummary: 'Billing',
          pageStateSummary: 'Ready',
          interactiveCount: 1,
          warnings: []
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_OBSERVE)],
      locale: 'zh',
      domainPolicy: {
        enabledDomains: ['allowed.example.com'],
        defaultEnabled: false
      }
    });

    const prompt = messages.at(-1)?.content ?? '';
    expect(prompt).toContain('DOMAIN_NOT_ENABLED');
    expect(prompt).not.toContain('Policy gated billing memory');
    expect(prompt).not.toContain('打开账单');
  });

  it('withholds observed page context from provider prompts without provider-context consent', () => {
    const messages = buildMessages({
      record: recordWithTrace([
        ...toolRead(TOOL_NAMES.PAGE_READ_ARTICLE, { includeHeadings: true }, 'Read article: private checkout token')
      ]),
      snapshot: {
        ...snapshotWithLastToolResult(TOOL_NAMES.PAGE_READ_ARTICLE),
        observation: {
          url: 'https://docs.example.com/private',
          title: 'Private account page',
          currentDomain: 'docs.example.com',
          origin: 'https://docs.example.com',
          visibleTextSummary: 'Private checkout token abc-123 and user email secret@example.com',
          pageStateSummary: 'Sensitive account page ready',
          interactiveCount: 3,
          warnings: []
        },
        structuredPageData: {
          observation: tabData('private observation', [{
            url: 'https://docs.example.com/private',
            title: 'Private account page',
            currentDomain: 'docs.example.com',
            origin: 'https://docs.example.com',
            pageStateSummary: 'Sensitive account page ready',
            visibleTextSummary: 'secret@example.com'
          }]),
          refs: tabData('private refs', [{
            refId: 'ref_secret',
            role: 'button',
            name: 'Reveal API key',
            tagName: 'button',
            visible: true
          }]),
          interactive: tabData('private interactive', [{
            refId: 'ref_secret',
            role: 'button',
            name: 'Reveal API key',
            tagName: 'button',
            visible: true,
            disabled: false,
            warnings: []
          }]),
          forms: tabData('private forms', [{
            refId: 'field_secret',
            label: 'Recovery email secret@example.com',
            type: 'email',
            required: false,
            disabled: false,
            sensitive: false,
            valuePreview: 'secret@example.com',
            validation: { valid: true },
            warnings: []
          }])
        },
        toolResult: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article: private checkout token',
          detail: {
            data: {
              text: 'Private checkout token abc-123 and user email secret@example.com',
              contentSource: 'article'
            }
          },
          changedPage: false,
          requiresObserve: false
        }
      },
      toolsContracts: [toolContract(TOOL_NAMES.PAGE_READ_ARTICLE)],
      locale: 'zh',
      requireProviderContextConsent: true
    });

    const prompt = messages.at(-1)?.content ?? '';
    const jsonStart = prompt.indexOf('{');
    expect(jsonStart).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(prompt.slice(jsonStart)) as {
      providerContextPolicy?: {
        allowed: boolean;
        operation: string;
        reason?: string;
      };
      observation?: unknown;
      structuredPageData?: unknown;
      priorityPageReadText?: unknown;
      recentActions?: unknown;
      lastToolResult?: unknown;
    };

    expect(parsed.providerContextPolicy).toMatchObject({
      allowed: false,
      operation: 'provider_context',
      reason: 'DOMAIN_NOT_ENABLED'
    });
    expect(parsed.observation).toBeUndefined();
    expect(parsed.structuredPageData).toBeUndefined();
    expect(parsed.priorityPageReadText).toBeUndefined();
    expect(parsed.recentActions).toBeUndefined();
    expect(parsed.lastToolResult).toBeUndefined();
    expect(prompt).not.toContain('secret@example.com');
    expect(prompt).not.toContain('Private checkout token');
    expect(prompt).not.toContain('Reveal API key');
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
