import type {
  DecideApprovalInput,
  RuntimeEvent,
  RuntimeProviderSettings,
  RuntimeProviderTestResult,
  RuntimeToolExecutionResult,
  RunSnapshot,
  HighlightRefInput,
  ReviseGoalInput,
  StartRunInput,
  TestProviderSettingsInput
} from './runtime-messages';

export interface RuntimePort {
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot>;
  highlightRef(input: HighlightRefInput): Promise<RuntimeToolExecutionResult>;
  sendUserReply(runId: string, message: string): Promise<void>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void;
  decideApproval(input: DecideApprovalInput): Promise<RuntimeToolExecutionResult>;
  getProviderSettings(): Promise<RuntimeProviderSettings | undefined>;
  setProviderSettings(settings: RuntimeProviderSettings): Promise<void>;
  testProviderSettings(input: TestProviderSettingsInput): Promise<RuntimeProviderTestResult>;
}
