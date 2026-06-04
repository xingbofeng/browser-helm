import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  booleanField,
  collectObservationText,
  fail,
  isRecord,
  latestToolStartedArgsBefore,
  pass,
  stringField,
  structuredPassedEvidence,
  subsequentSuccessfulObservation,
  textIncludes
} from './verifier-utils';

const CLICK_TOOLS = new Set<string>([TOOL_NAMES.ACTION_CLICK, TOOL_NAMES.POINTER_CLICK]);

export function verifyClickEffectCompletion(input: VerificationInput): TaskVerificationResult {
  for (let index = input.trace.length - 1; index >= 0; index -= 1) {
    const event = input.trace[index];
    if (
      event?.type !== TRACE_EVENT_NAMES.TOOL_RESULT ||
      !isRecord(event.payload) ||
      typeof event.payload.tool !== 'string' ||
      !CLICK_TOOLS.has(event.payload.tool) ||
      event.payload.ok !== true
    ) {
      continue;
    }
    if (booleanField(event.payload, 'effectObserved') === true) {
      return pass('click_effect', 'Click result includes explicit effect evidence.', [
        { kind: 'click_result', summary: stringField(event.payload, 'summary') ?? 'effectObserved', tool: event.payload.tool }
      ]);
    }
    const structuredEvidence = structuredPassedEvidence(
      event.payload,
      ['effectEvidence', 'domEffectEvidence', 'stateEvidence'],
      event.payload.tool
    );
    if (structuredEvidence.length > 0) {
      return pass('click_effect', 'Click result includes structured DOM effect evidence.', structuredEvidence);
    }
    const args = latestToolStartedArgsBefore(input.trace, index, event.payload.tool);
    const expectedEffectText = stringField(args, 'expectedEffectText');
    const observation = subsequentSuccessfulObservation(input.trace, index);
    if (!observation) {
      return fail('click_effect', 'unknown', 'Click has no follow-up observation.', ['post_click_observation'], [], event.payload.tool);
    }
    const previousObservation = latestSuccessfulObservationBefore(input.trace, index);
    const previousUrl = observationUrl(previousObservation);
    const nextUrl = observationUrl(observation);
    if (previousUrl && nextUrl && previousUrl !== nextUrl) {
      return pass('click_effect', 'Follow-up observation shows URL changed after click.', [
        { kind: 'url_change', summary: `${previousUrl} -> ${nextUrl}`, tool: TOOL_NAMES.PAGE_OBSERVE }
      ]);
    }
    const stateEvidence = clickedTargetStateEvidence(observation, args);
    if (stateEvidence) {
      return pass('click_effect', 'Follow-up observation shows clicked target state changed.', [
        stateEvidence
      ]);
    }
    const observationText = collectObservationText(input.trace, index);
    if (expectedEffectText && textIncludes(observationText, expectedEffectText)) {
      return pass('click_effect', 'Expected click effect text appeared after click.', [
        { kind: 'post_click_observation', summary: expectedEffectText, tool: TOOL_NAMES.PAGE_OBSERVE }
      ]);
    }
    return fail(
      'click_effect',
      'unknown',
      'Click has only trace-shape evidence, not semantic effect evidence.',
      ['click_effect_evidence'],
      [{ kind: 'post_click_observation', summary: observationText.slice(0, 160), tool: TOOL_NAMES.PAGE_OBSERVE }],
      event.payload.tool
    );
  }
  return fail('click_effect', 'unknown', 'No click action exists.', ['click_result']);
}

function latestSuccessfulObservationBefore(trace: VerificationInput['trace'], index: number): VerificationInput['trace'][number] | undefined {
  for (let current = index - 1; current >= 0; current -= 1) {
    const event = trace[current];
    if (
      event?.type === TRACE_EVENT_NAMES.TOOL_RESULT &&
      isRecord(event.payload) &&
      event.payload.tool === TOOL_NAMES.PAGE_OBSERVE &&
      event.payload.ok === true
    ) {
      return event;
    }
  }
  return undefined;
}

function observationUrl(event: VerificationInput['trace'][number] | undefined): string | undefined {
  if (!event || !isRecord(event.payload)) {
    return undefined;
  }
  return stringField(event.payload, 'url') ??
    (isRecord(event.payload.data) ? stringField(event.payload.data, 'url') : undefined) ??
    (isRecord(event.payload.detail) && isRecord(event.payload.detail.data)
      ? stringField(event.payload.detail.data, 'url')
      : undefined);
}

function clickedTargetStateEvidence(
  observation: VerificationInput['trace'][number],
  args: Record<string, unknown> | undefined
) {
  const refId = stringField(args, 'refId');
  if (!refId || !isRecord(observation.payload)) {
    return undefined;
  }
  const target = findObservedRef(observation.payload, refId);
  if (!target) {
    return undefined;
  }
  const state = ['expanded', 'selected', 'checked', 'pressed', 'focused']
    .find((key) => booleanField(target, key) === true);
  return state
    ? { kind: `target_${state}`, summary: `${refId} ${state}=true`, tool: TOOL_NAMES.PAGE_OBSERVE }
    : undefined;
}

function findObservedRef(value: unknown, refId: string, depth = 0): Record<string, unknown> | undefined {
  if (depth > 5) {
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findObservedRef(item, refId, depth + 1);
      if (found) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  if (stringField(value, 'refId') === refId) {
    return value;
  }
  for (const nested of Object.values(value)) {
    const found = findObservedRef(nested, refId, depth + 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}
