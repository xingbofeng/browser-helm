import type { LoopSessionStatus } from './AgentState';

export class StateMachine {
  private currentStatus: LoopSessionStatus = 'running';

  get status(): LoopSessionStatus {
    return this.currentStatus;
  }

  transitionTo(status: LoopSessionStatus): void {
    this.currentStatus = status;
  }

  isTerminal(): boolean {
    return (
      this.currentStatus === 'cancelled' ||
      this.currentStatus === 'finished' ||
      this.currentStatus === 'failed'
    );
  }
}
