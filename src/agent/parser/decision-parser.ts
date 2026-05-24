import type { ZodError } from 'zod';

import {
  type AgentDecision,
  agentDecisionSchema
} from '../../shared/schemas/agent-decision.schema';
import { ERROR_CODES } from '../../shared/constants/error-codes';

type DecisionParseError = {
  code:
    | typeof ERROR_CODES.MODEL_OUTPUT_INVALID_JSON
    | typeof ERROR_CODES.MODEL_OUTPUT_SCHEMA_INVALID;
  message: string;
  detail?: unknown;
};

type DecisionParseSuccess = {
  ok: true;
  decision: AgentDecision;
};

type DecisionParseFailure = {
  ok: false;
  error: DecisionParseError;
};

export type DecisionParseResult = DecisionParseSuccess | DecisionParseFailure;

export class DecisionParser {
  parse(rawText: string): DecisionParseResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObjectText(rawText));
    } catch {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.MODEL_OUTPUT_INVALID_JSON,
          message: 'Model output is not valid JSON'
        }
      };
    }

    const result = agentDecisionSchema.safeParse(parsed);
    if (!result.success) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.MODEL_OUTPUT_SCHEMA_INVALID,
          message: 'Model output does not match AgentDecision schema',
          detail: normalizeZodError(result.error)
        }
      };
    }

    return {
      ok: true,
      decision: result.data
    };
  }
}

function normalizeZodError(error: ZodError): {
  issues: {
    path: string;
    message: string;
  }[];
} {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }))
  };
}

function extractJsonObjectText(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}
