import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import type { RunSnapshot, RuntimeEvent } from '../../runtime/runtime-messages';
import type { RunSummary } from '../../shared/schemas/session-summary';
import { buildStepSummaries } from './step-summary-builder';
import { sanitizeMemoryText } from './memory-write-policy';

export type BuildRunSummaryInput = {
  runId: string;
  task: string;
  trace: RuntimeEvent[];
  snapshot?: RunSnapshot | undefined;
};

export function buildRunSummary(input: BuildRunSummaryInput): RunSummary {
  const steps = buildStepSummaries(input.trace);
  const outcome = resolveOutcome(input.trace, input.snapshot);
  const keyFindings = uniqueStrings(
    steps
      .filter((step) => step.outcome === 'success')
      .map((step) => step.summary)
      .slice(-8)
  );
  const failureReason = resolveFailureReason(input.trace, input.snapshot);
  const completionCriteria = input.snapshot?.goal?.successCriteria ?? [];
  const completionEvidence = uniqueStrings([
    ...(input.snapshot?.goal?.satisfiedCriteria ?? []),
    ...steps.flatMap((step) => step.completionEvidence)
  ]).slice(0, 12);

  return {
    runId: input.runId,
    task: sanitizeMemoryText(input.task).value,
    outcome,
    keyFindings,
    reusableSteps: steps.filter((step) => step.outcome === 'success'),
    completionCriteria: completionCriteria.map((criterion) => sanitizeMemoryText(criterion).value),
    completionEvidence,
    unmetCriteria: (input.snapshot?.goal?.unsatisfiedCriteria ?? []).map((criterion) => sanitizeMemoryText(criterion).value),
    ...(failureReason ? { failureReason } : {})
  };
}

function resolveOutcome(trace: RuntimeEvent[], snapshot: RunSnapshot | undefined): RunSummary['outcome'] {
  if (snapshot?.status === 'finished') return 'success';
  if (snapshot?.status === 'failed' || snapshot?.status === 'error') return 'failed';
  if (snapshot?.status === 'cancelled') return 'cancelled';
  if (trace.some((event) => event.type === TRACE_EVENT_NAMES.RUN_FINISHED)) return 'success';
  if (trace.some((event) => event.type === TRACE_EVENT_NAMES.RUN_FAILED)) return 'failed';
  if (trace.some((event) => event.type === TRACE_EVENT_NAMES.RUN_CANCELLED)) return 'cancelled';
  return 'running';
}

function resolveFailureReason(trace: RuntimeEvent[], snapshot: RunSnapshot | undefined): string | undefined {
  if (snapshot?.error?.message) {
    return sanitizeMemoryText(snapshot.error.message).value;
  }
  const failed = findLastEvent(trace, TRACE_EVENT_NAMES.RUN_FAILED);
  const payload = failed?.payload && typeof failed.payload === 'object' && !Array.isArray(failed.payload)
    ? failed.payload
    : undefined;
  const message = payload ? stringField(payload, 'summary') ?? stringField(payload, 'message') : undefined;
  return message ? sanitizeMemoryText(message).value : undefined;
}

function findLastEvent(trace: RuntimeEvent[], type: string): RuntimeEvent | undefined {
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (event?.type === type) {
      return event;
    }
  }
  return undefined;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, all) => all.indexOf(value) === index);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}
