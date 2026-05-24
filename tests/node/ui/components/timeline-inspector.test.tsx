import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StepTimeline } from '../../../../src/ui/components/step-timeline';
import { ToolInspector } from '../../../../src/ui/components/tool-inspector';
import { TraceLog } from '../../../../src/ui/components/trace-log';

describe('timeline and inspector components', () => {
  it('renders approval and terminal events in the timeline', () => {
    const html = renderToString(
      <StepTimeline
        items={[
          { id: 'run_1:0', type: 'run_started', label: 'Run started' },
          { id: 'run_1:1', type: 'approval_required', label: 'Approval required' },
          { id: 'run_1:2', type: 'run_cancelled', label: 'Run cancelled' }
        ]}
      />
    );

    expect(html).toContain('Run started');
    expect(html).toContain('Approval required');
    expect(html).toContain('Run cancelled');
  });

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
          changedPage: false
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
    expect(html).toContain('[MASKED]');
    expect(html).not.toContain('secret');
  });

  it('renders trace detail without replay controls', () => {
    const html = renderToString(
      <TraceLog
        events={[
          { runId: 'run_1', type: 'tool_result', payload: { summary: 'Observed page' } }
        ]}
      />
    );

    expect(html).toContain('tool_result');
    expect(html).toContain('Observed page');
    expect(html).not.toContain('Replay');
  });
});
