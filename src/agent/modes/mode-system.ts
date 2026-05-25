import type { RunMode } from '../../shared/schemas/tool.schema';
import type { TaskClassification } from '../../shared/schemas/mode-system.schema';
import { classifyTask } from '../task/task-classifier';

type ResolveRunModeInput = {
  task: string;
  explicitMode?: RunMode;
};

type ResolvedRunMode = {
  mode: RunMode;
  reason: string;
  classification: TaskClassification;
};

export function resolveRunMode(input: ResolveRunModeInput): ResolvedRunMode {
  const classified = classifyTask(input.task);
  if (input.explicitMode) {
    return {
      mode: input.explicitMode,
      reason: `用户显式选择 ${input.explicitMode} mode；${boundaryReason(input.explicitMode)}`,
      classification: {
        ...classified,
        taskType: input.explicitMode,
        mode: input.explicitMode
      }
    };
  }

  return {
    mode: classified.mode,
    reason: `${classified.reason} ${boundaryReason(classified.mode)}`,
    classification: classified
  };
}

function boundaryReason(mode: RunMode): string {
  if (mode === 'act') {
    return 'v1.0 的 Act 仅用于动作准备和审批边界，不自动执行填写或提交。';
  }
  return 'v1.0 默认先诊断，再行动。';
}
