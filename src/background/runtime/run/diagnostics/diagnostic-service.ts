import type { ContentRpcClient } from '../../../../page/messaging/content-rpc-client';
import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import type { RunSnapshot, RuntimeEvent } from '../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import { AgentLoop } from '../../../../agent/kernel/agent-loop';
import { DecisionParser } from '../../../../agent/parser/decision-parser';
import { ToolRouter } from '../../../../tools/core/tool-router';
import { ContextBuilder } from '../../../../agent/context/context-builder';
import { InMemoryTraceRecorder } from '../../../../storage/memory/in-memory-trace-recorder';
import { createToolRegistry } from '../../../../tools';
import { RuntimeDiagnosticModelClient } from '../../runtime-diagnostic-model-client';
import { CachedObservationRpcClient } from './cached-observation-rpc-client';
import { extractSnapshotFields, fallbackSnapshotFields } from '../run-snapshot-assembler';
import { normalizeAgentTraceEvents, withTimeout } from '../runtime-event-utils';

export async function enrichSnapshotWithDiagnostics(input: {
  runId: string;
  record: { mode: RunMode; trace: RuntimeEvent[] };
  tabId: number;
  observeResult: ToolResult;
  snapshot: RunSnapshot;
  createContentRpcClient: (tabId: number) => ContentRpcClient;
}): Promise<RunSnapshot> {
  const { record, tabId, observeResult, snapshot, createContentRpcClient, runId } = input;

  if (record.mode !== 'form' && record.mode !== 'debug') {
    return snapshot;
  }

  const traceRecorder = new InMemoryTraceRecorder();
  const rpc = new CachedObservationRpcClient(
    createContentRpcClient(tabId),
    observeResult
  );
  const agent = new AgentLoop({
    modelClient: new RuntimeDiagnosticModelClient(),
    decisionParser: new DecisionParser(),
    toolRouter: new ToolRouter(createToolRegistry(rpc)),
    contextBuilder: new ContextBuilder(),
    traceRecorder
  });

  const result = await withTimeout(agent.run({
    task: snapshot.mode === 'form'
      ? '诊断当前表单状态'
      : snapshot.mode === 'debug'
        ? '检查当前页面健康状态'
        : '观察当前页面并准备诊断',
    mode: record.mode,
    maxSteps: record.mode === 'form' || record.mode === 'debug' ? 3 : 1
  }), 1000);

  if (!result) {
    return {
      ...snapshot,
      ...fallbackSnapshotFields(record.mode, observeResult),
      trace: record.trace,
      canInterrupt: true,
      canReviseGoal: true
    };
  }

  const agentTrace = result.trace;
  const snapshotFields = extractSnapshotFields(agentTrace);
  const normalizedAgentTrace = normalizeAgentTraceEvents(runId, agentTrace);

  return {
    ...snapshot,
    ...snapshotFields,
    trace: [...record.trace, ...normalizedAgentTrace],
    canInterrupt: true,
    canReviseGoal: true
  };
}
