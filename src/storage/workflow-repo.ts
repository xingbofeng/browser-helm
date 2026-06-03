import { sanitizeMemoryDetail, sanitizeMemoryText } from '../agent/memory/memory-write-policy';
import type {
  WorkflowAdapterBinding,
  WorkflowKeyRefHint,
  WorkflowMemory,
  WorkflowReplayPreview,
  WorkflowStep
} from '../shared/schemas/workflow';
import {
  createIndexedDbWorkflowPersistence,
  type WorkflowRepoPersistence
} from './browser-helm-db';

export type SaveWorkflowInput = {
  domain: string;
  origin?: string | undefined;
  urlPattern?: string | undefined;
  requiredPageTitleHints?: string[] | undefined;
  requiredPageTextHints?: string[] | undefined;
  keyRefHints?: WorkflowKeyRefHint[] | undefined;
  toolManifestHash?: string | undefined;
  adapter?: WorkflowAdapterBinding | undefined;
  completionEvidence?: string[] | undefined;
  intent: string;
  taskDescription: string;
  steps: WorkflowStep[];
};

export type WorkflowPreviewContext = {
  domain?: string | undefined;
  origin?: string | undefined;
  url?: string | undefined;
  title?: string | undefined;
  visibleTextSummary?: string | undefined;
  pageStateSummary?: string | undefined;
  refs?: Array<{
    refId?: string | undefined;
    role?: string | undefined;
    name?: string | undefined;
    tagName?: string | undefined;
    locator?: string | undefined;
  }> | undefined;
  toolManifestHash?: string | undefined;
  adapter?: WorkflowAdapterBinding | undefined;
};

export class WorkflowRepo {
  private readonly workflows = new Map<string, WorkflowMemory>();

  constructor(private readonly persistence?: WorkflowRepoPersistence | undefined) {
    void this.hydrate();
  }

  save(input: SaveWorkflowInput): WorkflowMemory {
    const now = Date.now();
    const id = createId('flow');
    const workflow: WorkflowMemory = {
      id,
      domain: input.domain,
      ...(input.origin ? { origin: input.origin } : {}),
      ...(input.urlPattern ? { urlPattern: input.urlPattern } : {}),
      requiredPageTitleHints: sanitizeTextArray(input.requiredPageTitleHints),
      requiredPageTextHints: sanitizeTextArray(input.requiredPageTextHints),
      keyRefHints: sanitizeKeyRefHints(input.keyRefHints),
      ...(input.toolManifestHash ? { toolManifestHash: sanitizeMemoryText(input.toolManifestHash).value } : {}),
      ...(input.adapter ? { adapter: sanitizeAdapter(input.adapter) } : {}),
      completionEvidence: sanitizeTextArray(input.completionEvidence),
      intent: sanitizeMemoryText(input.intent).value,
      taskDescription: sanitizeMemoryText(input.taskDescription).value,
      steps: input.steps.map(sanitizeWorkflowStep),
      successCount: 0,
      failureCount: 0,
      createdAt: now,
      updatedAt: now
    };
    this.workflows.set(id, workflow);
    void this.persistence?.put(workflow);
    return workflow;
  }

  update(id: string, patch: Partial<Pick<WorkflowMemory, 'intent' | 'taskDescription' | 'steps' | 'successCount' | 'failureCount'>>): WorkflowMemory | undefined {
    const current = this.workflows.get(id);
    if (!current) {
      return undefined;
    }
    const next: WorkflowMemory = {
      ...current,
      ...(patch.intent ? { intent: sanitizeMemoryText(patch.intent).value } : {}),
      ...(patch.taskDescription ? { taskDescription: sanitizeMemoryText(patch.taskDescription).value } : {}),
      ...(patch.steps ? { steps: patch.steps.map(sanitizeWorkflowStep) } : {}),
      ...(patch.successCount !== undefined ? { successCount: patch.successCount } : {}),
      ...(patch.failureCount !== undefined ? { failureCount: patch.failureCount } : {}),
      updatedAt: Date.now()
    };
    this.workflows.set(id, next);
    void this.persistence?.put(next);
    return next;
  }

  get(id: string): WorkflowMemory | undefined {
    return this.workflows.get(id);
  }

  delete(id: string): boolean {
    const deleted = this.workflows.delete(id);
    if (deleted) {
      void this.persistence?.delete(id);
    }
    return deleted;
  }

  list(domain?: string): WorkflowMemory[] {
    return [...this.workflows.values()]
      .filter((workflow) => domain ? workflow.domain === domain : true)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  lookup(input: { domain: string; query?: string | undefined; limit?: number | undefined }): WorkflowMemory[] {
    const query = input.query?.toLowerCase().trim();
    const tokens = tokenize(query ?? '');
    return this.list(input.domain)
      .filter((workflow) => {
        if (!tokens.length) {
          return true;
        }
        const haystack = `${workflow.intent} ${workflow.taskDescription}`.toLowerCase();
        return tokens.some((token) => haystack.includes(token));
      })
      .slice(0, input.limit ?? 5);
  }

  preview(id: string, context?: WorkflowPreviewContext): WorkflowReplayPreview | undefined {
    const workflow = this.get(id);
    if (!workflow) {
      return undefined;
    }
    const highRisk = workflow.steps.some((step) => step.risk === 'high' || step.requiresApproval);
    const unmetPreconditions = context ? evaluateWorkflowPreconditions(workflow, context) : [];
    return {
      workflowId: workflow.id,
      domain: workflow.domain,
      intent: workflow.intent,
      stepCount: workflow.steps.length,
      highRisk,
      requiresApproval: true,
      steps: workflow.steps,
      warnings: highRisk
        ? ['Workflow contains high-risk or approval-gated steps.', ...unmetPreconditions.map((item) => `Unmet precondition: ${item}`)]
        : ['Workflow replay requires explicit user approval.', ...unmetPreconditions.map((item) => `Unmet precondition: ${item}`)],
      unmetPreconditions
    };
  }

  score(id: string, outcome: 'success' | 'failed'): WorkflowMemory | undefined {
    const current = this.workflows.get(id);
    if (!current) {
      return undefined;
    }
    return this.update(id, {
      successCount: current.successCount + (outcome === 'success' ? 1 : 0),
      failureCount: current.failureCount + (outcome === 'failed' ? 1 : 0)
    });
  }

  private async hydrate(): Promise<void> {
    const persisted = await this.persistence?.load();
    for (const workflow of persisted ?? []) {
      this.workflows.set(workflow.id, workflow);
    }
  }
}

export const defaultWorkflowRepo = new WorkflowRepo(createIndexedDbWorkflowPersistence());

function sanitizeWorkflowStep(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    summary: sanitizeMemoryText(step.summary).value,
    ...(step.args === undefined ? {} : { args: sanitizeMemoryDetail(step.args) }),
    ...(step.argsPreview === undefined ? {} : { argsPreview: sanitizeMemoryDetail(step.argsPreview) })
  };
}

function sanitizeTextArray(values: string[] | undefined): string[] {
  return (values ?? [])
    .map((value) => sanitizeMemoryText(value).value)
    .filter((value) => value.length > 0);
}

function sanitizeKeyRefHints(hints: WorkflowKeyRefHint[] | undefined): WorkflowKeyRefHint[] {
  return (hints ?? []).map((hint) => ({
    ...(hint.refId ? { refId: sanitizeMemoryText(hint.refId).value } : {}),
    ...(hint.role ? { role: sanitizeMemoryText(hint.role).value } : {}),
    ...(hint.name ? { name: sanitizeMemoryText(hint.name).value } : {}),
    ...(hint.locator ? { locator: sanitizeMemoryText(hint.locator).value } : {})
  }));
}

function sanitizeAdapter(adapter: WorkflowAdapterBinding): WorkflowAdapterBinding {
  return {
    id: sanitizeMemoryText(adapter.id).value,
    ...(adapter.version ? { version: sanitizeMemoryText(adapter.version).value } : {})
  };
}

export function evaluateWorkflowPreconditions(
  workflow: WorkflowMemory,
  context: WorkflowPreviewContext
): string[] {
  const failures: string[] = [];
  if ((context.domain ?? '') !== workflow.domain) {
    failures.push('domain');
  }
  if (workflow.origin && context.origin !== workflow.origin) {
    failures.push('origin');
  }
  if (workflow.urlPattern && !matchesUrlPattern(context.url, workflow.urlPattern)) {
    failures.push('url_pattern');
  }
  if (workflow.requiredPageTitleHints.length > 0 && !containsAllHints(context.title, workflow.requiredPageTitleHints)) {
    failures.push('required_title');
  }
  const pageText = [context.visibleTextSummary, context.pageStateSummary].filter(Boolean).join(' ');
  if (workflow.requiredPageTextHints.length > 0 && !containsAllHints(pageText, workflow.requiredPageTextHints)) {
    failures.push('required_text');
  }
  if (workflow.keyRefHints.length > 0 && !workflow.keyRefHints.every((hint) => hasMatchingRef(context.refs ?? [], hint))) {
    failures.push('key_ref');
  }
  if (workflow.toolManifestHash && context.toolManifestHash !== workflow.toolManifestHash) {
    failures.push('tool_manifest_hash');
  }
  if (workflow.adapter?.id && context.adapter?.id !== workflow.adapter.id) {
    failures.push('adapter_id');
  }
  if (workflow.adapter?.version && context.adapter?.version !== workflow.adapter.version) {
    failures.push('adapter_version');
  }
  return [...new Set(failures)];
}

export function evaluateWorkflowCompletionEvidence(
  workflow: WorkflowMemory,
  context: WorkflowPreviewContext
): string[] {
  const pageText = [
    context.url,
    context.title,
    context.visibleTextSummary,
    context.pageStateSummary
  ].filter(Boolean).join(' ');
  return workflow.completionEvidence.filter((evidence) =>
    !pageText.toLowerCase().includes(evidence.toLowerCase())
  );
}

function containsAllHints(value: string | undefined, hints: string[]): boolean {
  const normalized = (value ?? '').toLowerCase();
  return hints.every((hint) => normalized.includes(hint.toLowerCase()));
}

function hasMatchingRef(refs: NonNullable<WorkflowPreviewContext['refs']>, hint: WorkflowKeyRefHint): boolean {
  return refs.some((ref) =>
    matchesHint(ref.refId, hint.refId) &&
    matchesHint(ref.role, hint.role) &&
    matchesHint(ref.name, hint.name) &&
    matchesHint(ref.locator, hint.locator)
  );
}

function matchesHint(actual: string | undefined, expected: string | undefined): boolean {
  return !expected || (actual ?? '').toLowerCase().includes(expected.toLowerCase());
}

function matchesUrlPattern(url: string | undefined, pattern: string): boolean {
  if (!url) {
    return false;
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`, 'u').test(url);
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tokenize(value: string): string[] {
  const words = value.toLowerCase().split(/[^\p{L}\p{N}_]+/u).filter((token) => token.length >= 2);
  const cjkBigrams = Array.from(value.matchAll(/[\p{Script=Han}]{2,}/gu))
    .flatMap((match) => bigrams(match[0] ?? ''));
  return [...new Set([...words, ...cjkBigrams])];
}

function bigrams(value: string): string[] {
  return Array.from(value).flatMap((_, index, chars) =>
    index + 1 < chars.length ? [`${chars[index]}${chars[index + 1]}`] : []
  );
}
