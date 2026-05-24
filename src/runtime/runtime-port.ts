import type { RuntimeEvent, RunSnapshot, StartRunInput } from './runtime-messages';

export interface RuntimePort {
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  sendUserReply(runId: string, message: string): Promise<void>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void;
}
