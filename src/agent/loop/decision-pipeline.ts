import { DecisionParser, type DecisionParseResult } from '../parser/decision-parser';
import type { AgentDecision } from '../../shared/schemas/agent-decision.schema';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import type { ToolPromptContract } from '../../tools/core/tool-router';
import type { RunRecord } from './types';
import {
  normalizeModelDecision
} from './form-fill-augmenter';
import {
  validateModelDecision,
  validateRepairDecision,
  type ModelDecisionError
} from './decision-validator';

type DecisionParseError = Extract<DecisionParseResult, { ok: false }>['error'];

export type DecisionPipelineInput = {
  outputText: string;
  toolsContracts: ToolPromptContract[];
  snapshot: RunSnapshot;
  record: RunRecord;
  lastRepairError?: ModelDecisionError | undefined;
};

export type DecisionPipelineResult =
  | {
      ok: true;
      decision: AgentDecision;
    }
  | {
      ok: false;
      parsed: true;
      error: ModelDecisionError;
    }
  | {
      ok: false;
      parsed: false;
      error: DecisionParseError;
    };

export class DecisionPipeline {
  private readonly parser = new DecisionParser();

  evaluate(input: DecisionPipelineInput): DecisionPipelineResult {
    const parsed = this.parser.parse(input.outputText);
    if (!parsed.ok) {
      return {
        ok: false,
        parsed: false,
        error: parsed.error
      };
    }
    const decision = normalizeModelDecision(parsed.decision);
    const decisionError = validateRepairDecision(decision, input.lastRepairError) ??
      validateModelDecision(
        decision,
        input.toolsContracts,
        input.snapshot,
        input.record
      );
    if (decisionError) {
      return {
        ok: false,
        parsed: true,
        error: decisionError
      };
    }
    return {
      ok: true,
      decision
    };
  }
}
