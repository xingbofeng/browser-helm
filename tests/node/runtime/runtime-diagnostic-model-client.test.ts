import { describe, expect, it } from 'vitest';

import { RuntimeDiagnosticModelClient } from '../../../src/background/runtime/runtime-diagnostic-model-client';

describe('RuntimeDiagnosticModelClient', () => {
  it('calls the form field reader on the first form step', async () => {
    await expect(expectDecision(
      'Current run mode: form.',
      0
    )).resolves.toMatchObject({
      type: 'tool_call',
      tool: 'bh_form_read_fields',
      args: {}
    });
  });

  it('calls the page health collector on the first debug step', async () => {
    await expect(expectDecision(
      'Current run mode: debug.',
      0
    )).resolves.toMatchObject({
      type: 'tool_call',
      tool: 'bh_debug_collect_page_health',
      args: {}
    });
  });

  it('finishes ask mode without calling diagnostic tools', async () => {
    await expect(expectDecision(
      'Current run mode: ask.',
      0
    )).resolves.toMatchObject({
      type: 'finish',
      message: '诊断准备完成'
    });
  });

  it('falls back to ask behavior when the mode marker is missing', async () => {
    await expect(expectDecision(
      'BrowserHelm runtime diagnostic prompt',
      0
    )).resolves.toMatchObject({
      type: 'finish',
      message: '诊断准备完成'
    });
  });

  it('finishes after the first diagnostic tool call', async () => {
    await expect(expectDecision(
      'Current run mode: form.',
      1
    )).resolves.toMatchObject({
      type: 'finish',
      message: 'Form Doctor 诊断报告已生成'
    });
  });
});

async function expectDecision(systemText: string, stepIndex: number) {
  const client = new RuntimeDiagnosticModelClient();
  const output = await client.complete({
    runId: 'run_diagnostic',
    stepIndex,
    messages: [
      {
        role: 'system',
        content: systemText
      }
    ]
  });
  return JSON.parse(output.text) as unknown;
}
