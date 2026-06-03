import type { TaskVerificationResult, VerificationInput } from './verifier-utils';
import {
  collectObservationText,
  fail,
  hasInsufficientEvidenceLanguage,
  hasUnableToCompleteRequiredActionLanguage,
  meaningfulTokens,
  numericTokens,
  pass,
  passUnknown
} from './verifier-utils';

export function verifyAnswerCompletion(input: VerificationInput): TaskVerificationResult {
  if (hasUnableToCompleteRequiredActionLanguage(input.finalMessage)) {
    return fail(
      'answer',
      'unknown',
      'The final answer says a requested action was skipped or could not be executed.',
      ['requested_action_completed']
    );
  }
  if (hasInsufficientEvidenceLanguage(input.finalMessage)) {
    return passUnknown(
      'answer',
      'The final answer explicitly states that evidence is insufficient.',
      ['grounded_answer_evidence']
    );
  }
  const finalMessage = input.finalMessage?.trim();
  if (!finalMessage) {
    return fail('answer', 'unknown', 'Answer completion has no final answer text.', ['final_answer_text']);
  }

  const evidenceText = collectObservationText(input.trace);
  if (!evidenceText) {
    return fail('answer', 'unknown', 'Answer completion has no page or tool evidence.', ['grounded_answer_evidence']);
  }

  const evidenceTokens = new Set(meaningfulTokens(evidenceText));
  const answerTokens = meaningfulTokens(finalMessage).filter((token) =>
    !COMMON_ANSWER_WORDS.has(token)
  );
  const groundedTokenCount = answerTokens.filter((token) => evidenceTokens.has(token)).length;
  const missingNumbers = numericTokens(finalMessage).filter((token) => !evidenceText.includes(token.toLowerCase()));

  if (missingNumbers.length > 0 && hasSpecificClaim(finalMessage)) {
    return fail(
      'answer',
      'fail',
      'The final answer is not grounded in observed page or tool evidence.',
      ['grounded_answer_evidence'],
      [{ kind: 'observation_text', summary: evidenceText.slice(0, 160) }]
    );
  }

  if (answerTokens.length >= 4 && groundedTokenCount === 0 && hasSpecificClaim(finalMessage)) {
    return fail(
      'answer',
      'fail',
      'The final answer contains a specific claim that is not grounded in observed evidence.',
      ['grounded_answer_evidence'],
      [{ kind: 'observation_text', summary: evidenceText.slice(0, 160) }]
    );
  }

  return pass('answer', 'The final answer is grounded in observed page evidence.', [
    { kind: 'observation_text', summary: evidenceText.slice(0, 160) }
  ]);
}

function hasSpecificClaim(value: string): boolean {
  return /(?:costs?|price|plan|typeerror|http|total|amount|deadline|expires?|价格|费用|金额|截止|过期)/iu.test(value);
}

const COMMON_ANSWER_WORDS = new Set([
  'the',
  'and',
  'that',
  'this',
  'from',
  'with',
  'page',
  'answer',
  'per',
  'month',
  'costs',
  '计划',
  '页面'
]);
