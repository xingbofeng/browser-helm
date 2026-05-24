import type { LoopSessionStatus } from './agent-state';
import { StateMachine } from './state-machine';

export class RunController {
  pauseReason: string | undefined;
  pendingApprovalRequestId: string | undefined;
  private readonly stateMachine = new StateMachine();

  constructor(readonly maxSteps: number) {}

  get status(): LoopSessionStatus {
    return this.stateMachine.status;
  }

  canRunStep(stepIndex: number): boolean {
    if (this.stateMachine.isTerminal()) {
      return false;
    }
    if (this.status === 'paused' || this.status === 'waiting_for_approval') {
      return false;
    }
    return stepIndex < this.maxSteps;
  }

  cancel(): void {
    this.stateMachine.transitionTo('cancelled');
  }

  pause(reason: string): void {
    this.stateMachine.transitionTo('paused');
    this.pauseReason = reason;
  }

  resume(): void {
    this.stateMachine.transitionTo('running');
    this.pauseReason = undefined;
    this.pendingApprovalRequestId = undefined;
  }

  waitForApproval(requestId: string): void {
    this.stateMachine.transitionTo('waiting_for_approval');
    this.pendingApprovalRequestId = requestId;
  }

  approvePendingApproval(): void {
    this.resume();
  }

  denyPendingApproval(reason: string): void {
    this.stateMachine.transitionTo('failed');
    this.pauseReason = reason;
    this.pendingApprovalRequestId = undefined;
  }

  markFinished(): void {
    this.stateMachine.transitionTo('finished');
  }

  markFailed(): void {
    this.stateMachine.transitionTo('failed');
  }
}
