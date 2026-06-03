import { describe, expect, it } from 'vitest';
import { TaskStateReducer } from '../../../../src/agent/loop/task-state-reducer';
import type { RunRecord } from '../../../../src/agent/loop/types';

describe('TaskStateReducer', () => {
  it('applies model updates and syncs successful form tool results into runtime task state', () => {
    const record: RunRecord = {
      task: '填写姓名',
      mode: 'form',
      trace: []
    };
    const reducer = new TaskStateReducer();

    reducer.applyModelDecision(record, {
      type: 'tool_call',
      tool: 'bh_form_fill_many',
      args: {},
      taskStateUpdate: {
        completed: ['识别姓名字段'],
        remaining: ['填写姓名字段']
      }
    });
    reducer.syncFromToolResult(record, {
      tool: 'bh_form_fill_many',
      ok: true,
      code: 'OK',
      summary: 'filled',
      changedPage: true,
      requiresObserve: true,
      detail: {
        data: {
          fields: [{ fieldRefId: 'ref_name' }]
        }
      }
    });

    expect(record.taskState).toMatchObject({
      completed: ['识别姓名字段'],
      filledFieldRefs: ['ref_name'],
      recommendedNextDecision: 'finish',
      updatedBy: 'runtime_and_model'
    });
  });
});
