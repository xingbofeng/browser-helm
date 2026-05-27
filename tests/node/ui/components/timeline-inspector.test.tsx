import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ToolInspector } from '../../../../src/ui/components/tool-inspector';
import { TraceLog } from '../../../../src/ui/components/trace-log';

describe('timeline and inspector components', () => {
  it('renders tool result flags and redacted args', () => {
    const html = renderToString(
      <ToolInspector
        toolResult={{
          tool: 'bh_iframe_type',
          ok: false,
          code: 'APPROVAL_REQUIRED',
          summary: 'Requires approval',
          requiresApproval: true,
          requiresObserve: true,
          changedPage: false,
          detail: {
            data: {
              visible: true,
              token: 'plain-token'
            }
          }
        }}
        argsPreview={{
          password: 'secret',
          refId: 'frame_1:ref_2'
        }}
      />
    );

    expect(html).toContain('bh_iframe_type');
    expect(html).toContain('APPROVAL_REQUIRED');
    expect(html).toContain('需要用户确认');
    expect(html).toContain('visible');
    expect(html).toContain('[MASKED]');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('plain-token');
  });

  it('renders trace detail without replay controls', () => {
    const html = renderToString(
      <TraceLog
        events={[
          { runId: 'run_1', type: 'tool_result', payload: { summary: 'Observed page' } }
        ]}
      />
    );

    expect(html).toContain('工具结果');
    expect(html).toContain('Observed page');
    expect(html).not.toContain('Replay');
  });

  it('renders tool descriptions for tool trace items', () => {
    const html = renderToString(
      <TraceLog
        events={[
          {
            runId: 'run_1',
            type: 'tool_started',
            payload: { tool: 'bh_page_observe', args: {} }
          },
          {
            runId: 'run_1',
            type: 'tool_result',
            payload: {
              tool: 'bh_page_observe',
              ok: true,
              summary: 'Observed x.com'
            }
          }
        ]}
      />
    );

    expect(html).toContain('Observes the current page and returns a bounded summary');
    expect(html).toContain('调用工具：bh_page_observe');
    expect(html).toContain('工具结果：bh_page_observe');
  });

  it('summarizes streaming delta trace events instead of rendering every chunk', () => {
    const html = renderToString(
      <TraceLog
        events={[
          { runId: 'run_1', type: 'model_stream_started', payload: { model: 'gpt-test' } },
          { runId: 'run_1', type: 'model_stream_delta', payload: { charCount: 5, preview: 'hello' } },
          { runId: 'run_1', type: 'model_stream_delta', payload: { charCount: 6, preview: ' world' } },
          { runId: 'run_1', type: 'model_stream_finished', payload: { charCount: 11 } }
        ]}
      />
    );

    expect(html).toContain('生成中');
    expect(html).toContain('查看原始详情');
    expect(html).toContain('chunkCount');
    expect(html).toContain('2');
    expect(html).not.toContain('model_stream_delta</strong>');
  });
});
