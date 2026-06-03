import { buildWorkflowDraft } from '../../agent/memory/plan-to-workflow-draft';
import { buildRunSummary } from '../../agent/memory/run-summary-builder';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import { defaultMemoryRepo, type MemoryRepo } from '../../storage/memory-repo';
import { defaultWorkflowRepo, type WorkflowRepo } from '../../storage/workflow-repo';
import type { RunRecord } from './run/runtime-service-types';

export type MemoryWorkflowServiceDeps = {
  memoryRepo?: MemoryRepo | undefined;
  workflowRepo?: WorkflowRepo | undefined;
};

export type EnrichMemoryWorkflowSnapshotInput = {
  snapshot: RunSnapshot;
  record: RunRecord | undefined;
  canExposeMemoryReuse: boolean;
};

export class MemoryWorkflowService {
  private readonly memoryRepo: MemoryRepo;
  private readonly workflowRepo: WorkflowRepo;

  constructor(deps: MemoryWorkflowServiceDeps = {}) {
    this.memoryRepo = deps.memoryRepo ?? defaultMemoryRepo;
    this.workflowRepo = deps.workflowRepo ?? defaultWorkflowRepo;
  }

  enrichSnapshot(input: EnrichMemoryWorkflowSnapshotInput): RunSnapshot {
    const { snapshot, record, canExposeMemoryReuse } = input;
    const domain = snapshot.observation?.currentDomain;
    if (!domain || !canExposeMemoryReuse) {
      return snapshot;
    }
    const workflowPreviews = record
      ? this.workflowRepo.lookup({ domain, query: record.task, limit: 3 })
        .flatMap((workflow) => {
          const preview = this.workflowRepo.preview(workflow.id);
          return preview ? [preview] : [];
        })
      : [];
    const workflowDraft = record && snapshot.status === 'finished'
      ? buildWorkflowDraft({
        domain,
        runSummary: buildRunSummary({
          runId: snapshot.runId,
          task: record.task,
          trace: record.trace,
          snapshot
        })
      })
      : undefined;

    return {
      ...snapshot,
      memory: {
        domain,
        entries: this.memoryRepo.list(domain),
        ...(workflowPreviews.length ? { workflowPreviews } : {})
      },
      ...(workflowDraft ? { workflowDraft } : {})
    };
  }
}
