import {
  evaluateBrowserHelmDomainPolicy,
  type BrowserHelmDomainPolicy
} from '../../shared/domain-policy';
import { sanitizeMemoryText } from './memory-write-policy';
import type { MemoryRepo } from '../../storage/memory-repo';
import type { ScratchpadRepo } from '../../storage/scratchpad-repo';
import type { WorkflowRepo } from '../../storage/workflow-repo';
import {
  DEFAULT_MEMORY_CONTEXT_POLICY,
  type MemoryContextPolicy
} from './memory-context-policy';

export type BuildMemoryPromptContextInput = {
  domain?: string | undefined;
  task: string;
  runId: string;
  memoryRepo: MemoryRepo;
  workflowRepo: WorkflowRepo;
  scratchpadRepo: ScratchpadRepo;
  domainPolicy?: BrowserHelmDomainPolicy | undefined;
  policy?: Partial<MemoryContextPolicy> | undefined;
};

export type MemoryPromptContext = {
  domain: string;
  permission: {
    allowed: boolean;
    restricted: boolean;
    reason?: string | undefined;
  };
  memoryHits: Array<{
    id: string;
    kind: string;
    task: string;
    summary: string;
    score: number;
    successCount: number;
    failureCount: number;
    tags: string[];
  }>;
  workflowHits: Array<{
    id: string;
    intent: string;
    taskDescription: string;
    stepCount: number;
    successCount: number;
    failureCount: number;
  }>;
  scratchpad?: {
    runId: string;
    content: string;
    charCount: number;
  } | undefined;
};

export function buildMemoryPromptContext(input: BuildMemoryPromptContextInput): MemoryPromptContext | undefined {
  if (!input.domain) {
    return undefined;
  }

  const policy = {
    ...DEFAULT_MEMORY_CONTEXT_POLICY,
    ...input.policy
  };
  const decision = evaluateBrowserHelmDomainPolicy(input.domain, input.domainPolicy);
  const base = {
    domain: input.domain,
    permission: {
      allowed: decision.allowed,
      restricted: decision.restricted,
      ...(decision.reason ? { reason: decision.reason } : {})
    }
  };
  if (!decision.allowed) {
    return {
      ...base,
      memoryHits: [],
      workflowHits: []
    };
  }

  const query = sanitizeMemoryText(input.task).value;
  const scratchpad = input.scratchpadRepo.read(input.runId);
  const scratchpadContent = truncate(scratchpad.content, policy.maxScratchpadChars);

  return {
    ...base,
    memoryHits: input.memoryRepo.lookup({
      domain: input.domain,
      query,
      limit: policy.maxMemoryHits
    }).map((hit) => ({
      id: hit.id,
      kind: hit.kind,
      task: truncate(hit.task, policy.maxSummaryChars),
      summary: truncate(hit.summary, policy.maxSummaryChars),
      score: hit.score,
      successCount: hit.successCount,
      failureCount: hit.failureCount,
      tags: hit.tags.slice(0, 8).map((tag) => truncate(tag, 80))
    })),
    workflowHits: input.workflowRepo.lookup({
      domain: input.domain,
      query,
      limit: policy.maxWorkflowHits
    }).map((workflow) => ({
      id: workflow.id,
      intent: truncate(workflow.intent, policy.maxSummaryChars),
      taskDescription: truncate(workflow.taskDescription, policy.maxSummaryChars),
      stepCount: workflow.steps.length,
      successCount: workflow.successCount,
      failureCount: workflow.failureCount
    })),
    ...(scratchpadContent
      ? {
          scratchpad: {
            runId: scratchpad.runId,
            content: scratchpadContent,
            charCount: scratchpad.content.length
          }
        }
      : {})
  };
}

function truncate(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value;
}

