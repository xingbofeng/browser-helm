import type { ApprovalRequest } from '../../shared/schemas/approval.schema';
import { createSimpleStore } from './store-core';

type ApprovalStatus = ApprovalRequest['status'];

type ApprovalStoreState = {
  pending?: ApprovalRequest | undefined;
  decision?: ApprovalStatus | undefined;
  decisionError?: string | undefined;
  setPending: (request: ApprovalRequest) => void;
  startDecision: (decision: ApprovalStatus) => void;
  failDecision: (message: string) => void;
};

export function createApprovalStore() {
  const state: ApprovalStoreState = {
    setPending: (request) => {
      state.pending = request;
      state.decisionError = undefined;
    },
    startDecision: (decision) => {
      state.decision = decision;
      state.decisionError = undefined;
    },
    failDecision: (message) => {
      state.decision = undefined;
      state.decisionError = message;
    }
  };
  return createSimpleStore(state);
}
