import type { RunSnapshot, RuntimeEvent } from '../../runtime/runtime-messages';
import type { SessionSummary } from '../../shared/schemas/session-summary';
import { buildRunSummary } from './run-summary-builder';
import { sanitizeMemoryText } from './memory-write-policy';

export type BuildSessionSummaryInput = {
  sessionId: string;
  taskGoal: string;
  trace: RuntimeEvent[];
  snapshot?: RunSnapshot | undefined;
};

export function buildSessionSummary(input: BuildSessionSummaryInput): SessionSummary {
  const runSummary = buildRunSummary({
    runId: input.snapshot?.runId ?? input.sessionId,
    task: input.taskGoal,
    trace: input.trace,
    snapshot: input.snapshot
  });
  const observation = input.snapshot?.observation;
  const successfulSteps = runSummary.reusableSteps;

  return {
    sessionId: input.sessionId,
    ...(observation?.currentDomain ? { domain: observation.currentDomain } : {}),
    taskGoal: sanitizeMemoryText(input.taskGoal).value,
    importantPageState: [
      observation?.title,
      observation?.pageStateSummary,
      observation?.visibleTextSummary
    ].filter((value): value is string => Boolean(value?.trim())).map((value) => sanitizeMemoryText(value).value).slice(0, 6),
    confirmedActions: successfulSteps
      .filter((step) => step.tool && step.outcome === 'success')
      .map((step) => `${step.tool}: ${step.summary}`)
      .slice(0, 8),
    reusableLocators: extractReusableLocators(input.snapshot).slice(0, 12),
    nextTimeHints: successfulSteps
      .map((step) => step.summary)
      .slice(-6),
    runSummaries: [runSummary]
  };
}

function extractReusableLocators(snapshot: RunSnapshot | undefined): string[] {
  return (snapshot?.refs ?? [])
    .filter((ref) => ref.visible)
    .map((ref) => [
      ref.refId,
      ref.role,
      ref.name
    ].filter(Boolean).join(' '))
    .filter((value) => value.trim().length > 0)
    .map((value) => sanitizeMemoryText(value).value);
}

