import type { ZodError } from 'zod';

import {
  type AgentDecision,
  agentDecisionSchema
} from '../../shared/schemas/agent-decision.schema';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { tZh } from '../../i18n/t';

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

const MULTI_ACTION_QUESTION = tZh('agent.error.decision.noNextAction');

const TOOL_ALIASES: Record<string, string> = {
  bh_page_get_visible_text: TOOL_NAMES.PAGE_READ_VISIBLE_TEXT
};

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
          message: tZh('agent.error.decision.notJson')
        }
      };
    }

    const result = agentDecisionSchema.safeParse(normalizeProviderDecision(parsed));
    if (!result.success) {
      return {
        ok: false,
        error: {
          code: ERROR_CODES.MODEL_OUTPUT_SCHEMA_INVALID,
          message: tZh('agent.error.decision.schemaInvalid'),
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

function normalizeProviderDecision(parsed: unknown): unknown {
  if (!isRecord(parsed)) {
    return parsed;
  }
  if (parsed.type === 'ask' && typeof parsed.message === 'string') {
    return {
      type: 'ask_user',
      question: parsed.message,
      ...taskStateUpdateFrom(parsed)
    };
  }
  if (parsed.type === 'ask_user' && typeof parsed.message === 'string' && typeof parsed.question !== 'string') {
    return {
      ...parsed,
      question: parsed.message
    };
  }
  if (parsed.type === 'multi') {
    return {
      type: 'ask_user',
      question: MULTI_ACTION_QUESTION
    };
  }
  if (parsed.type === 'decision') {
    return normalizeDecisionEnvelope(parsed);
  }
  if (isRecord(parsed.tool_call)) {
    return normalizeToolCallDecision({
      type: 'tool_call',
      ...parsed.tool_call,
      ...(!isRecord(parsed.tool_call.taskStateUpdate) ? taskStateUpdateFrom(parsed) : {})
    });
  }
  return normalizeToolCallDecision(parsed);
}

function normalizeDecisionEnvelope(parsed: Record<string, unknown>): unknown {
  const decision = typeof parsed.decision === 'string' ? parsed.decision : undefined;
  if (!decision) {
    return parsed;
  }
  if (decision === 'finish') {
    const finish = isRecord(parsed.finish) ? parsed.finish : {};
    const message = typeof finish.message === 'string'
      ? finish.message
      : typeof parsed.message === 'string'
        ? parsed.message
        : undefined;
    return message
      ? {
          type: 'finish',
          message,
          ...taskStateUpdateFrom(parsed)
        }
      : parsed;
  }
  if (decision === 'ask_user' || decision === 'ask') {
    const question = typeof parsed.question === 'string'
      ? parsed.question
      : typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.reason === 'string'
          ? parsed.reason
          : undefined;
    return question
      ? {
          type: 'ask_user',
          question,
          ...taskStateUpdateFrom(parsed)
        }
      : parsed;
  }
  if (decision === 'fail') {
    const message = typeof parsed.message === 'string'
      ? parsed.message
      : typeof parsed.reason === 'string'
        ? parsed.reason
        : undefined;
    return message
      ? {
          type: 'fail',
          message,
          ...(typeof parsed.code === 'string' ? { code: parsed.code } : {}),
          ...taskStateUpdateFrom(parsed)
        }
      : parsed;
  }
  return parsed;
}

function normalizeToolCallDecision(parsed: Record<string, unknown>): Record<string, unknown> {
  const tool = typeof parsed.tool === 'string' ? TOOL_ALIASES[parsed.tool] ?? parsed.tool : parsed.tool;
  const normalizedTool = tool === parsed.tool
    ? parsed
    : {
        ...parsed,
        tool
      };
  if (normalizedTool.type === 'tool_call' && normalizedTool.tool === 'bh_ask_user' && isRecord(normalizedTool.args)) {
    const question = typeof normalizedTool.args.question === 'string'
      ? normalizedTool.args.question
      : typeof normalizedTool.args.message === 'string'
        ? normalizedTool.args.message
        : undefined;
    if (question) {
      return {
        type: 'ask_user',
        question,
        ...taskStateUpdateFrom(normalizedTool)
      };
    }
  }
  if (normalizedTool.type !== 'tool_call' || normalizedTool.tool !== 'bh_form_fill' || !isRecord(normalizedTool.args)) {
    return normalizedTool;
  }
  const formFields = normalizedTool.args.formFields;
  if (!isRecord(formFields)) {
    return normalizedTool;
  }
  return {
    ...normalizedTool,
    tool: 'bh_form_fill_many',
    args: {
      fields: Object.entries(formFields)
        .filter((entry): entry is [string, string] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'string'
        )
        .map(([fieldRefId, value]) => ({ fieldRefId, value }))
    }
  };
}

function taskStateUpdateFrom(parsed: Record<string, unknown>): Record<string, unknown> {
  return isRecord(parsed.taskStateUpdate)
    ? { taskStateUpdate: parsed.taskStateUpdate }
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
