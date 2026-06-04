import { describe, expect, it } from 'vitest';

import { verifyTaskCompletionBeforeFinish } from '../../../../src/agent/verification/task-verifier';
import { TRACE_EVENT_NAMES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('task verifier', () => {
  it('blocks finish when a mutating tool reports success without page change evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          ok: true,
          code: 'OK',
          summary: 'ok',
          changedPage: false
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FORM_FILL_MANY
    });
  });

  it('requires semantic form verification even when mutating success includes page change evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          ok: true,
          code: 'OK',
          summary: 'ok',
          changedPage: true
        }
      }
    ])).toMatchObject({
      ok: false,
      verifier: 'form',
      missingEvidence: ['form_verify_result']
    });
  });

  it('blocks finish when a navigation-like action still requires observation evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'clicked',
          changedPage: true,
          requiresObserve: true
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.ACTION_CLICK
    });
  });

  it('requires semantic click-effect evidence after a navigation-like action is followed by observation', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.ACTION_CLICK,
          ok: true,
          code: 'OK',
          summary: 'clicked',
          changedPage: true,
          requiresObserve: true
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'observed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toMatchObject({
      ok: false,
      verifier: 'click_effect',
      missingEvidence: ['click_effect_evidence']
    });
  });

  it('allows visible text read as follow-up evidence after viewport scroll', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'ask'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'Observed article page with accessibility content',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.VIEWPORT_SCROLL,
          ok: true,
          code: 'OK',
          summary: 'scrolled',
          changedPage: true,
          requiresObserve: true
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
          ok: true,
          code: 'OK',
          summary: 'read visible text',
          changedPage: false,
          requiresObserve: false
        }
      }
    ], {
      finalMessage: 'The accessibility page shows article content after scrolling.'
    })).toMatchObject({
      ok: true
    });
  });

  it('continues with the explicitly requested visible text read before treating viewport scroll as unrecoverable', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'ask',
          task: '第二步调用 bh_viewport_scroll，第三步必须调用 bh_page_read_visible_text 读取滚动后的内容。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.VIEWPORT_SCROLL,
          ok: true,
          code: 'OK',
          summary: 'scrolled',
          changedPage: true,
          requiresObserve: true
        }
      }
    ], {
      finalMessage: '我已经滚动并读取了可见文本。'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'trace_shape',
      nextAction: 'continue',
      missingEvidence: ['required_tool:bh_page_read_visible_text'],
      tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT
    });
  });

  it('continues with visible text read when viewport scroll lacks follow-up reading evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'ask',
          task: '先读取可见文本，再滚动并总结。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
          ok: true,
          code: 'OK',
          summary: 'visible text before scrolling',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.VIEWPORT_SCROLL,
          ok: true,
          code: 'OK',
          summary: 'scrolled',
          changedPage: true,
          requiresObserve: true
        }
      }
    ], {
      finalMessage: '我已经滚动并总结。'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'trace_shape',
      nextAction: 'continue',
      missingEvidence: ['required_tool:bh_page_read_visible_text'],
      tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT
    });
  });

  it('continues when the user explicitly requested a tool that was not called', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'form',
          task: '必须调用 bh_form_read_fields，然后必须调用 bh_form_verify 复查。禁止调用 bh_form_submit_with_approval。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'read fields',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_MANY,
          ok: true,
          code: 'OK',
          summary: 'filled',
          changedPage: true,
          requiresObserve: false
        }
      }
    ], {
      finalMessage: '已填写并复查。'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      nextAction: 'continue',
      missingEvidence: ['required_tool:bh_form_verify'],
      tool: TOOL_NAMES.FORM_VERIFY
    });
  });

  it('does not require tools mentioned in a prohibition list', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'ask',
          task: '必须调用 bh_form_read_fields。禁止调用 bh_form_fill_field、bh_form_fill_many、bh_form_submit_with_approval。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'read fields about missing required inputs',
          changedPage: false,
          requiresObserve: false
        }
      }
    ], {
      finalMessage: '只读诊断完成，未修改页面。'
    })).not.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.arrayContaining type is compatible
      missingEvidence: expect.arrayContaining([
        `required_tool:${TOOL_NAMES.FORM_FILL_MANY}`,
        `required_tool:${TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL}`
      ])
    });
  });

  it('treats explicitly requested form fill alternatives as satisfied when either fill tool ran', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'form',
          task: '填写必须通过 bh_form_fill_field 或 bh_form_fill_many 完成。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'read fields',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          args: {
            fieldRefId: 'ref_search',
            value: '美国 无障碍'
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
        payload: {
          fieldRefId: 'ref_search',
          status: 'filled'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          ok: true,
          code: 'OK',
          summary: 'filled',
          changedPage: true,
          requiresObserve: false
        }
      }
    ], {
      finalMessage: '已填写搜索框，没有提交。'
    })).toMatchObject({
      ok: true,
      verifier: 'form'
    });
  });

  it('does not require conditional form fill tools when the page is blocked and no fields are available', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'form',
          task: [
            '如果页面被 Cloudflare 或 Just a moment 拦截，请使用 bh_page_read_visible_text 总结阻塞信息。',
            '当搜索框可用时，填写必须通过 bh_form_fill_field 或 bh_form_fill_many 完成。'
          ].join('\n')
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT,
          ok: true,
          code: 'OK',
          summary: 'stackoverflow.com Performing security verification by Cloudflare. Just a moment.'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'Read 0 fields'
        }
      }
    ], {
      finalMessage: '页面被 Cloudflare 安全验证拦截，当前没有搜索框可填写。'
    })).not.toMatchObject({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.arrayContaining type is compatible
      missingEvidence: expect.arrayContaining([
        `required_tool:${TOOL_NAMES.FORM_FILL_FIELD}`,
        `required_tool:${TOOL_NAMES.FORM_FILL_MANY}`
      ])
    });
  });

  it('continues when a task explicitly requires reading fields again after filling', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.RUN_STARTED,
        payload: {
          mode: 'form',
          task: '第一步必须调用 bh_form_read_fields。填写后再次调用 bh_form_read_fields 复查字段状态。'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_READ_FIELDS,
          ok: true,
          code: 'OK',
          summary: 'read fields',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_STARTED,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          args: {
            fieldRefId: 'ref_first',
            value: 'Test'
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
        payload: {
          fieldRefId: 'ref_first',
          status: 'filled'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FORM_FILL_FIELD,
          ok: true,
          code: 'OK',
          summary: 'filled',
          changedPage: true,
          requiresObserve: false
        }
      }
    ], {
      finalMessage: '已填写并复查。'
    })).toMatchObject({
      ok: false,
      status: 'unknown',
      verifier: 'trace_shape',
      nextAction: 'continue',
      missingEvidence: ['required_tool:bh_form_read_fields'],
      tool: TOOL_NAMES.FORM_READ_FIELDS
    });
  });

  it('blocks finish after submit result when no post-submit observation exists', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'submitted'
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
    });
  });

  it('requires semantic submit success evidence after submit result is followed by observation', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'observed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toMatchObject({
      ok: false,
      verifier: 'submit',
      missingEvidence: ['submit_success_evidence']
    });
  });

  it('does not treat negated success language as submit success evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'unknown',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'observed',
          changedPage: false,
          requiresObserve: false,
          data: {
            visibleTextSummary: 'Submission was not successful.'
          }
        }
      }
    ])).toMatchObject({
      ok: false,
      verifier: 'submit',
      status: 'fail',
      missingEvidence: ['submit_success_evidence']
    });
  });

  it('accepts post-submit URL change as submit success evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'before',
          data: { url: 'https://example.com/signup' }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'submitted',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'after',
          data: { url: 'https://example.com/welcome' }
        }
      }
    ])).toMatchObject({
      ok: true,
      verifier: 'submit',
      status: 'pass'
    });
  });

  it('accepts network 2xx evidence as submit success evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'submitted',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.CDP_GET_NETWORK_EVENTS,
          ok: true,
          code: 'OK',
          summary: 'network',
          data: {
            events: [
              { type: 'response', status: 201, url: 'https://example.com/signup' }
            ]
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'post-submit observe',
          data: { visibleTextSummary: 'Welcome' }
        }
      }
    ])).toMatchObject({
      ok: true,
      verifier: 'submit',
      status: 'pass'
    });
  });

  it('accepts form disappearance as submit success evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'before',
          data: {
            structuredPageData: {
              forms: { status: 'ready', count: 1 }
            }
          }
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.FORM_SUBMIT_RESULT,
        payload: {
          outcome: 'submitted',
          summary: 'submitted'
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.PAGE_OBSERVE,
          ok: true,
          code: 'OK',
          summary: 'after',
          data: {
            structuredPageData: {
              forms: { status: 'empty', count: 0 }
            }
          }
        }
      }
    ])).toMatchObject({
      ok: true,
      verifier: 'submit',
      status: 'pass'
    });
  });

  it('blocks finish after workflow replay without postcondition score evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toMatchObject({
      ok: false,
      tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL
    });
  });

  it('requires semantic workflow postcondition evidence after workflow replay has score evidence', () => {
    expect(verifyTaskCompletionBeforeFinish([
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_RUN_WITH_APPROVAL,
          ok: true,
          code: 'OK',
          summary: 'Workflow replay completed',
          changedPage: false,
          requiresObserve: false
        }
      },
      {
        runId: 'run_1',
        type: TRACE_EVENT_NAMES.TOOL_RESULT,
        payload: {
          tool: TOOL_NAMES.FLOW_SCORE,
          ok: true,
          code: 'OK',
          summary: 'Scored workflow',
          changedPage: false,
          requiresObserve: false
        }
      }
    ])).toMatchObject({
      ok: false,
      verifier: 'workflow_postcondition',
      missingEvidence: ['workflow_postcondition_evidence']
    });
  });
});
