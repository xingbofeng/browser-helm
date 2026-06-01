import type {
  DecideApprovalInput,
  ExecuteToolInput,
  RuntimeEvent,
  RuntimeProviderSettings,
  RuntimeProviderTestResult,
  RuntimeToolExecutionResult,
  RunSnapshot,
  HighlightRefInput,
  ReviseGoalInput,
  SetDomainAdapterEnabledInput,
  StartRunInput,
  TestProviderSettingsInput
} from './runtime-messages';
import type { BrowserHelmDomainPolicy } from '../shared/domain-policy';

export interface RuntimePort {
  startRun(input: StartRunInput): Promise<{ runId: string }>;
  cancelRun(runId: string): Promise<void>;
  reviseGoal(input: ReviseGoalInput): Promise<RunSnapshot>;
  highlightRef(input: HighlightRefInput): Promise<RuntimeToolExecutionResult>;
  executeTool(input: ExecuteToolInput): Promise<RuntimeToolExecutionResult>;
  sendUserReply(runId: string, message: string): Promise<void>;
  getRunSnapshot(runId: string): Promise<RunSnapshot>;
  subscribeRun(runId: string, listener: (event: RuntimeEvent) => void): () => void;
  decideApproval(input: DecideApprovalInput): Promise<RuntimeToolExecutionResult>;
  getProviderSettings(): Promise<RuntimeProviderSettings | undefined>;
  setProviderSettings(settings: RuntimeProviderSettings): Promise<void>;
  getDomainPolicy(): Promise<BrowserHelmDomainPolicy | undefined>;
  setDomainPolicy(policy: BrowserHelmDomainPolicy): Promise<void>;
  setDomainAdapterEnabled(input: SetDomainAdapterEnabledInput): Promise<RunSnapshot>;
  testProviderSettings(input: TestProviderSettingsInput): Promise<RuntimeProviderTestResult>;
}
