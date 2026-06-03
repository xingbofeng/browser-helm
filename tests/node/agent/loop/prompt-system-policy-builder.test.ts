import { describe, expect, it } from 'vitest';
import { buildMessages } from '../../../../src/agent/loop/prompt-builder';
import { SystemPolicyBuilder } from '../../../../src/agent/loop/prompt/system-policy-builder';
import type { RunRecord } from '../../../../src/agent/loop/types';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import type { ToolPromptContract } from '../../../../src/tools/core/tool-router';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';

describe('SystemPolicyBuilder', () => {
  it('keeps the system prefix byte-stable with buildMessages', () => {
    const record: RunRecord = {
      task: '总结页面',
      mode: 'ask',
      trace: [],
      locale: 'zh'
    };
    const snapshot = {
      runId: 'run_1',
      mode: 'ask',
      status: 'thinking',
      trace: [],
      streaming: { enabled: false, active: false, chunkCount: 0, fallbackUsed: false }
    } as RunSnapshot;
    const toolsContracts = [toolContract(TOOL_NAMES.PAGE_OBSERVE)];

    const existing = buildMessages({
      record,
      snapshot,
      toolsContracts,
      locale: 'zh'
    })[0];
    const extracted = new SystemPolicyBuilder().build({
      mode: 'ask',
      toolsContracts,
      locale: 'zh'
    });

    expect(extracted).toEqual(existing);
  });
});

function toolContract(name: string): ToolPromptContract {
  return {
    name,
    title: name,
    description: `${name} description`,
    modes: ['ask'],
    risk: 'safe',
    argsSchema: {
      type: 'object',
      properties: {},
      additionalProperties: true
    },
    readOnly: true,
    requiresApproval: false,
    contextVisibility: 'summary'
  };
}
