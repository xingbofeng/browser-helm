import type { RunMode } from '../../shared/schemas/tool.schema';
import { createSimpleStore } from './store-core';

export type RunDisplayState =
  | 'idle'
  | 'starting'
  | 'observing'
  | 'thinking'
  | 'executing_tool'
  | 'waiting_for_approval'
  | 'waiting_for_user'
  | 'recovering'
  | 'finished'
  | 'failed'
  | 'cancelled';

type AgentStoreState = {
  runId?: string | undefined;
  mode: RunMode;
  displayState: RunDisplayState;
  selectedStepId?: string | undefined;
  startRun: (input: { runId: string; mode: RunMode }) => void;
  setDisplayState: (state: RunDisplayState) => void;
  selectStep: (stepId: string) => void;
  cancelRun: () => void;
};

export function createAgentStore() {
  const state: AgentStoreState = {
    mode: 'ask',
    displayState: 'idle',
    startRun: (input) => {
      state.runId = input.runId;
      state.mode = input.mode;
      state.displayState = 'observing';
    },
    setDisplayState: (displayState) => {
      state.displayState = displayState;
    },
    selectStep: (stepId) => {
      state.selectedStepId = stepId;
    },
    cancelRun: () => {
      state.displayState = 'cancelled';
    }
  };
  return createSimpleStore(state);
}
