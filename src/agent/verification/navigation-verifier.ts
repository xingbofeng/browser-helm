import { TRACE_EVENT_NAMES } from '../../shared/constants/event-names';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  fail,
  isRecord,
  pass,
  stringField,
  subsequentSuccessfulObservation
} from './verifier-utils';

export function verifyNavigationCompletion(input: VerificationInput): TaskVerificationResult {
  for (let index = input.trace.length - 1; index >= 0; index -= 1) {
    const event = input.trace[index];
    if (
      event?.type !== TRACE_EVENT_NAMES.TOOL_RESULT ||
      !isRecord(event.payload) ||
      event.payload.tool !== TOOL_NAMES.ACTION_CLICK ||
      event.payload.ok !== true ||
      event.payload.requiresObserve !== true
    ) {
      continue;
    }
    const observation = subsequentSuccessfulObservation(input.trace, index);
    if (!observation) {
      return fail('navigation', 'unknown', 'Navigation-like action has no follow-up observation.', ['navigation_observation'], [], TOOL_NAMES.ACTION_CLICK);
    }
    const summary = isRecord(observation.payload) ? stringField(observation.payload, 'summary') : undefined;
    return pass('navigation', 'Navigation-like action has follow-up observation evidence.', [
      { kind: 'navigation_observation', summary: summary ?? 'observed', tool: TOOL_NAMES.PAGE_OBSERVE }
    ]);
  }
  return fail('navigation', 'unknown', 'No navigation-like action exists.', ['navigation_action']);
}
