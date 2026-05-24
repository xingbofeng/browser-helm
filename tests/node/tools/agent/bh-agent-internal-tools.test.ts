import { describe, expect, it } from 'vitest';

import { bhAgentAskUser } from '../../../../src/tools/agent/bh-agent-ask-user';
import { bhAgentFail } from '../../../../src/tools/agent/bh-agent-fail';
import { bhAgentFinish } from '../../../../src/tools/agent/bh-agent-finish';

describe('agent internal mock tools', () => {
  it('bhAgentFinish returns successful finish result', async () => {
    const result = await bhAgentFinish.execute(
      {
        message: 'All done'
      },
      {
        runId: 'run_1',
        stepId: 'step_1'
      }
    );

    expect(result.ok).toBe(true);
    expect(result.code).toBe('AGENT_FINISH');
  });

  it('bhAgentFail returns failed result', async () => {
    const result = await bhAgentFail.execute(
      {
        message: 'Cannot continue',
        code: 'MODEL_OUTPUT_INVALID'
      },
      {
        runId: 'run_1',
        stepId: 'step_2'
      }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('MODEL_OUTPUT_INVALID');
  });

  it('bhAgentAskUser returns ask_user style result', async () => {
    const result = await bhAgentAskUser.execute(
      {
        question: 'Should I continue?'
      },
      {
        runId: 'run_1',
        stepId: 'step_3'
      }
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe('ASK_USER_REQUIRED');
  });
});
