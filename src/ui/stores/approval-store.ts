import type { ApprovalUiState } from '../../shared/schemas/approval.schema';
import { createSimpleStore } from './store-core';

type ApprovalStatus = ApprovalUiState['status'];

type ApprovalStoreState = {
  pending?: ApprovalUiState | undefined;
  decision?: ApprovalStatus | undefined;
  decisionError?: string | undefined;
  setPending: (request: ApprovalUiState) => void;
  clearPending: () => void;
  startDecision: (decision: ApprovalStatus) => void;
  failDecision: (message: string) => void;
};

export function createApprovalStore() {
  const store = createSimpleStore<ApprovalStoreState>({
    setPending: (request) => {
      store.setState({
        pending: request,
        decisionError: undefined
      });
    },
    clearPending: () => {
      store.setState({
        pending: undefined,
        decision: undefined
      });
    },
    startDecision: (decision) => {
      store.setState({
        decision,
        decisionError: undefined
      });
    },
    failDecision: (message) => {
      store.setState({
        decision: undefined,
        decisionError: message
      });
    }
  });
  return store;
}
