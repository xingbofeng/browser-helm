import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import type { RuntimeEvent } from '../../../../src/runtime/runtime-messages';

describe('answer semantic verifier', () => {
  it('passes when the final answer is grounded in observed page evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed pricing page',
          data: { visibleTextSummary: 'Starter plan costs $20 per month.' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'The Starter plan costs $20 per month.'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('denies finish when the final answer is not grounded in page or tool evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed pricing page',
          data: { visibleTextSummary: 'Starter plan costs $20 per month.' }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'The Starter plan costs $30 per month.'
    })).toMatchObject({
      ok: false,
      status: 'fail',
      verifier: 'answer',
      missingEvidence: ['grounded_answer_evidence']
    });
  });

  it('passes when the final answer is grounded in article reader tool evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article',
          detail: {
            data: {
              text: 'Web accessibility includes assistive technologies and Web Content Accessibility Guidelines.'
            }
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
          ok: true,
          code: 'OK',
          summary: 'Read visible text',
          detail: {
            data: {
              text: 'Guidelines on accessible web design and assistive technologies used for web browsing.'
            }
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'Web accessibility includes assistive technologies and accessibility guidelines.'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('passes when a form doctor answer is grounded in read-only form diagnostic tools', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'Read 2 fields: ref_101 姓名 required empty; ref_102 我同意服务条款 required unchecked'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FIND_MISSING_REQUIRED,
          ok: true,
          code: 'OK',
          summary: 'Found missing required fields: 姓名 and 我同意服务条款'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FIND_DISABLED_SUBMIT_REASON,
          ok: true,
          code: 'OK',
          summary: 'Disabled submit reason: confirmed because required fields are empty'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: '提交按钮 ref_103 处于 disabled 状态，原因是 required 字段姓名为空且服务条款未勾选；本次只读诊断没有修改页面。'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('does not reject grounded article answers for derived cursor or text-length numbers', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article (truncated)',
          detail: {
            data: {
              text: 'Web accessibility covers assistive technologies and Web Content Accessibility Guidelines.',
              hasMore: true
            }
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'Web accessibility covers assistive technologies and guidelines, based on about 12000 characters.'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('does not treat numbered list markers as ungrounded factual numbers', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article',
          detail: {
            data: {
              text: 'Effective tools for agents should use clear interfaces, deterministic outputs, composable design, evaluation with agents, useful documentation, and avoid hidden state.'
            }
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: [
        '1. Use clear interfaces for tools.',
        '2. Return deterministic outputs.',
        '3. Design composable tools.',
        '4. Evaluate tools with agents.'
      ].join('\n')
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('does not treat generic tool-design error wording as an ungrounded page error finding', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article: Writing effective tools for agents with agents'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'Use clear tool interfaces and provide actionable error messages rather than bare error codes.'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('does not treat generic tool-design status wording as an ungrounded page status finding', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article: Writing effective tools for agents with agents'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: '工具调用应返回 status 标记、结构化 detail 和可读 summary，便于 Agent 判断下一步。'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('allows synthesized recommendations from successful long-article reading evidence', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article (truncated): Writing effective tools for agents with agents'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
          ok: true,
          code: 'OK',
          summary: 'Read page text after scroll: Engineering at Anthropic and tool design content'
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: '建议工具使用清晰接口、结构化返回值和可执行错误信息，并通过真实 Agent workflow 评估。'
    })).toMatchObject({
      ok: true,
      status: 'pass',
      verifier: 'answer'
    });
  });

  it('allows an explicit insufficient-evidence answer without marking it as success evidence', () => {
    const trace: RuntimeEvent[] = [{
      runId: 'run_1',
      type: TRACE_EVENT_NAMES.RUN_STARTED,
      payload: { mode: 'ask' }
    }];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: 'I do not have enough evidence from the page to answer that.'
    })).toMatchObject({
      ok: true,
      status: 'unknown',
      verifier: 'answer',
      missingEvidence: ['grounded_answer_evidence']
    });
  });

  it('does not finish when the final answer says a requested action was skipped', () => {
    const trace: RuntimeEvent[] = [
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: { mode: 'ask' }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_ARTICLE,
          ok: true,
          code: 'OK',
          summary: 'Read article',
          detail: {
            data: {
              text: 'Web accessibility includes assistive technologies and accessibility guidelines.'
            }
          }
        }
      }
    ];

    expect(verifyTaskCompletionBeforeFinish(trace, {
      finalMessage: '由于当前模式限制，无法执行后续滚动与可见文本读取步骤。'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'answer',
      nextAction: 'continue',
      missingEvidence: ['requested_action_completed']
    });
  });
});
