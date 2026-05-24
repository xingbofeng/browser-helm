import { describe, expect, it } from 'vitest';

import { traceEventSchema } from '../../../../src/shared/schemas/trace.schema';

describe('traceEventSchema', () => {
  it('accepts run_started event with planning reservation fields', () => {
    const event = traceEventSchema.parse({
      id: 'evt_1',
      runId: 'run_1',
      type: 'run_started',
      timestamp: 1710000000000,
      schemaVersion: '1.0.0',
      payload: {
        task: 'Diagnose the checkout form',
        goal: 'Find why submit is disabled',
        successCriteria: ['Explain root cause'],
        maxSteps: 5,
        metadata: {
          schemaVersion: '1.0.0',
          promptVersion: 'v0.1.0',
          toolSchemaVersion: 'v0.1.0',
          contextPolicyVersion: 'v0.1.0',
          model: 'gpt-5-mini'
        }
      }
    });

    expect(event.type).toBe('run_started');
    if (event.type !== 'run_started') {
      throw new Error('expected run_started event');
    }
    expect(event.payload.maxSteps).toBe(5);
  });

  it('accepts turn_started with intent and turn_finished with span timing', () => {
    const started = traceEventSchema.parse({
      id: 'evt_2',
      runId: 'run_1',
      turnId: 'turn_2',
      stepIndex: 1,
      type: 'turn_started',
      timestamp: 1710000001000,
      schemaVersion: '1.0.0',
      payload: {
        stepIndex: 1,
        intent: 'Observe page state',
        contextCharCount: 1200
      }
    });
    const finished = traceEventSchema.parse({
      id: 'evt_3',
      runId: 'run_1',
      turnId: 'turn_2',
      stepIndex: 1,
      type: 'turn_finished',
      timestamp: 1710000002000,
      durationMs: 1000,
      schemaVersion: '1.0.0',
      payload: {
        stepIndex: 1,
        startedAt: 1710000001000,
        endedAt: 1710000002000,
        durationMs: 1000,
        status: 'continued'
      }
    });

    if (started.type !== 'turn_started') {
      throw new Error('expected turn_started event');
    }
    if (finished.type !== 'turn_finished') {
      throw new Error('expected turn_finished event');
    }
    expect(started.payload.intent).toBe('Observe page state');
    expect(finished.payload.durationMs).toBe(1000);
  });

  it('rejects unknown event type', () => {
    expect(() =>
      traceEventSchema.parse({
        id: 'evt_bad',
        runId: 'run_1',
        type: 'custom_event',
        timestamp: 1710000000000,
        schemaVersion: '1.0.0',
        payload: {}
      })
    ).toThrowError();
  });
});
