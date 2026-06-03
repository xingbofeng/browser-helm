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
    const args = latestToolStartedArgsBefore(input.trace, index, event.payload.tool);
    const expectedEffectText = stringField(args, 'expectedEffectText');
    const observation = subsequentSuccessfulObservation(input.trace, index);
    if (!observation) {
      return fail('click_effect', 'unknown', 'Click has no follow-up observation.', ['post_click_observation'], [], event.payload.tool);
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
