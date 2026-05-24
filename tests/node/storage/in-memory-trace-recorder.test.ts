import { describe, expect, it } from 'vitest';

import { InMemoryTraceRecorder } from '../../../src/storage/memory/in-memory-trace-recorder';

describe('InMemoryTraceRecorder', () => {
  it('stores and returns events per runId', () => {
    const recorder = new InMemoryTraceRecorder();
    recorder.append({
      id: 'evt_1',
      runId: 'run_1',
      type: 'run_started',
      timestamp: 1,
      schemaVersion: '1.0.0',
      payload: {
        task: 'demo',
        maxSteps: 3,
        metadata: {
          schemaVersion: '1.0.0',
          promptVersion: 'v0.1.0',
          toolSchemaVersion: 'v0.1.0',
          contextPolicyVersion: 'v0.1.0',
          model: 'mock'
        }
      }
    });
    recorder.append({
      id: 'evt_2',
      runId: 'run_2',
      type: 'run_started',
      timestamp: 2,
      schemaVersion: '1.0.0',
      payload: {
        task: 'demo2',
        maxSteps: 3,
        metadata: {
          schemaVersion: '1.0.0',
          promptVersion: 'v0.1.0',
          toolSchemaVersion: 'v0.1.0',
          contextPolicyVersion: 'v0.1.0',
          model: 'mock'
        }
      }
    });

    expect(recorder.list('run_1')).toHaveLength(1);
    expect(recorder.list('run_2')).toHaveLength(1);
  });

  it('masks obvious secrets before persisting trace event payload', () => {
    const recorder = new InMemoryTraceRecorder();
    recorder.append({
      id: 'evt_secret',
      runId: 'run_secret',
      type: 'model_output_received',
      timestamp: 3,
      schemaVersion: '1.0.0',
      payload: {
        rawText:
          'Authorization: Bearer sk-secret-token OPENAI_API_KEY=sk-top-secret',
        model: 'mock'
      }
    });

    const events = recorder.list('run_secret');
    expect(events).toHaveLength(1);

    const text = JSON.stringify(events[0]);
    expect(text).toContain('[MASKED]');
    expect(text).not.toContain('sk-secret-token');
    expect(text).not.toContain('sk-top-secret');
  });
});
