import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { RunRecord } from './types';
import {
  applyModelTaskStateUpdate,
  syncTaskStateFromToolResult
} from './runtime-task-state';

export class TaskStateReducer {
  applyModelDecision(record: RunRecord, decision: AgentDecision): void {
    applyModelTaskStateUpdate(record, decision);
  }

  syncFromToolResult(record: RunRecord, result: RunSnapshot['toolResult']): void {
    syncTaskStateFromToolResult(record, result);
  }
}
