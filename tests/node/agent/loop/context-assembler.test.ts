import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ContextAssembler } from '../../../../src/agent/loop/context-assembler';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';

const pageObserveContract: ToolPromptContract = {
  name: 'bh_page_observe',
  title: 'Observe Page',
  description: 'Observe the page',
  modes: ['ask'],
  risk: 'low',
  argsSchema: z.object({}),
  readOnly: true,
  requiresApproval: false,
  contextVisibility: 'summary'
};

const highRiskContract: ToolPromptContract = {
  name: 'bh_form_submit_with_approval',
  title: 'Submit Form',
  description: 'Submit a form',
  modes: ['form'],
  risk: 'high',
  argsSchema: z.object({}),
  readOnly: false,
  requiresApproval: true,
  contextVisibility: 'summary'
};

const cdpContract: ToolPromptContract = {
  name: 'bh_cdp_get_console_events',
  title: 'Get Console Events',
  description: 'Reads console events',
  modes: ['debug'],
  risk: 'medium',
  argsSchema: z.object({}),
  readOnly: true,
  requiresApproval: false,
  contextVisibility: 'summary'
};

describe('ContextAssembler', () => {
  it('selects visible tools and builds model messages for the current turn', async () => {
    const record: RunRecord = {
      task: '总结当前页面',
      mode: 'ask',
      trace: []
    };
    const snapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'thinking',
      trace: [],
      streaming: { enabled: false, active: false, chunkCount: 0, fallbackUsed: false }
    } as RunSnapshot;
    const assembler = new ContextAssembler({
      getDomainPolicy: async () => ({
        enabledDomains: [],
        updatedAt: 1
      })
    });

    const result = await assembler.assembleTurn({
      record,
      snapshot,
      tabId: 1,
      stepIndex: 0,
      allToolsContracts: [pageObserveContract, highRiskContract]
    });

    expect(result.toolsContracts.map((tool) => tool.name)).toEqual(['bh_page_observe']);
    expect(result.selectionPayload).toMatchObject({
      stepIndex: 0,
      toolCount: 1,
      toolNames: ['bh_page_observe']
    });
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('does not expose capability-bound tools when snapshot capabilities are missing', async () => {
    const record: RunRecord = {
      task: '检查 console 错误',
      mode: 'debug',
      trace: []
    };
    const snapshot = {
      runId: 'run_1',
      mode: 'debug',
      status: 'thinking',
      trace: [],
      streaming: { enabled: false, active: false, chunkCount: 0, fallbackUsed: false }
    } as RunSnapshot;

    const result = await new ContextAssembler().assembleTurn({
      record,
      snapshot,
      tabId: 1,
      stepIndex: 0,
      allToolsContracts: [pageObserveContract, cdpContract]
    });

    expect(result.toolsContracts.map((tool) => tool.name)).not.toContain('bh_cdp_get_console_events');
    expect(result.selectionPayload.limitations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Debugger')
      ])
    );
  });
});
