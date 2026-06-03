import type { ToolResult } from '../../../../shared/schemas/tool-result.schema';
import type { RunSnapshot, RuntimeEvent, ExecuteToolInput } from '../../../../runtime/runtime-messages';
import type { RunMode } from '../../../../shared/schemas/tool.schema';
import type { ContentRpcClient } from '../../../../page/messaging/content-rpc-client';
import type { ToolRouter } from '../../../../tools/core/tool-router';
import type { RuntimeToolResultSnapshot } from '../../../../runtime/runtime-messages';
import type { ToolRuntimeAdapter } from './adapters/tool-runtime-adapter';
import { ERROR_CODES } from '../../../../shared/constants/error-codes';
import { TRACE_EVENT_NAMES } from '../../../../shared/constants/event-names';
import { TOOL_NAMES } from '../../../../shared/constants/tool-names';
import { INTERNAL_TOOL_NAMES } from '../../../../shared/constants/internal-tool-names';
import type { BrowserHelmDomainPolicyOperation } from '../../../../shared/domain-policy';
import { redactToolArgs } from '../../../../tools/core/tool-args-redaction';
import type { approvalRequiredResult } from '../../../../tools/core/tool-result-factory';
import { userDeniedApprovalResult } from '../../../../tools/core/tool-result-factory';
import type { approvalRequestForTrace } from '../runtime-event-utils';

import { toolStartedEvent, toolResultEvent, approvalRequiredEvent } from './tool-runtime-events';
import type { ApprovalManager } from '../../../../runtime/approval/approval-manager';
import type { ApprovalRequest } from '../../../../shared/schemas/approval.schema';
import type { Locale } from '../../../../i18n/types';
import { t } from '../../../../i18n/t';
import type { VisionClientLike } from '../../../../agent/model/vision-client';
import { ApprovalCoordinator } from '../approval/approval-coordinator';
import { AuthorizationService, buildActionPreview } from '../security/authorization-service';
import type {
  RuntimeCapabilityRequirement,
  RuntimeToolPolicyLike,
  ToolAuthorizationContext
} from '../security/action-context';

export type ToolExecutionDeps = {
  getSnapshot: (runId: string) => RunSnapshot;
  getRecord: (runId: string) => { task: string; mode: RunMode; tabId?: number | undefined; trace: RuntimeEvent[]; skipProviderResponse?: boolean | undefined; locale?: Locale } | undefined;
  appendTrace: (record: { trace: RuntimeEvent[] }, event: RuntimeEvent) => void;
  createToolRouter: (tabId: number) => ToolRouter;
  createContentRpcClient: (tabId: number) => ContentRpcClient;
  setSnapshot: (runId: string, snapshot: RunSnapshot) => void;
  setPendingAction: (requestId: string, input: ExecuteToolInput) => void;
  snapshotToolResult: (tool: string, result: ToolResult) => RuntimeToolResultSnapshot;
  getDomainPolicy?: (() => Promise<ToolAuthorizationContext['domainPolicy']> | ToolAuthorizationContext['domainPolicy']) | undefined;
  adapters?: ToolRuntimeAdapter[];
  adapter?: ToolRuntimeAdapter;
  toolPolicy: RuntimeToolPolicyLike;
  authorizationService?: AuthorizationService | undefined;
  approvalCoordinator?: Pick<ApprovalCoordinator, 'createRequest'> | undefined;
  approvalManager: ApprovalManager;
  approvalRequestForTrace: typeof approvalRequestForTrace;
  approvalRequiredResultFn: typeof approvalRequiredResult;
  createVisionClient?: (() => Promise<VisionClientLike | undefined>) | undefined;
};

export class ToolExecutionService {
  constructor(private readonly deps: ToolExecutionDeps) {}

  async execute(input: ExecuteToolInput): Promise<ToolResult> {
    const record = this.deps.getRecord(input.runId);
    const redactedArgs = redactToolArgs(input.tool, input.args);

    if (this.deps.getSnapshot(input.runId).status === 'cancelled') {
      return {
        ok: false, code: ERROR_CODES.RUN_CANCELLED,
        summary: t('runtime.error.userCancelReason', record?.locale ?? 'zh'),
        changedPage: false, requiresObserve: false,
        error: { message: t('runtime.error.userCancelReason', record?.locale ?? 'zh') }
      };
    }

    if (!record?.tabId) {
      const result = userDeniedApprovalResult('Run is not available for tool execution');
      this.deps.setSnapshot(input.runId, {
        runId: input.runId, mode: record?.mode ?? 'ask', status: 'error', refs: [],
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        error: { code: result.code, message: result.summary },
        trace: record?.trace ?? []
      });
      return result;
    }

    const router = this.deps.createToolRouter(record.tabId);
    const contract = router.getToolContract(input.tool, record.mode);
    const adapter = this.getAdapter(input.tool);
    const approvalArgsPreview = adapter.approvalArgsPreview?.(input, redactedArgs) ?? redactedArgs;

    if (!contract && isHiddenIframeMutationTool(input.tool)) {
      const result = this.deps.approvalRequiredResultFn({
        reason: 'Iframe mutating actions require explicit approval and are not exposed as model-visible public tools.',
        risk: 'high',
        actionPreview: buildActionPreview({
          title: input.tool,
          tool: input.tool,
          argsPreview: approvalArgsPreview
        })
      });
      const request = this.createApprovalRequest(input, {
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        tool: input.tool,
        argsPreview: approvalArgsPreview,
        risk: 'high',
        reason: result.approval?.reason ?? result.summary,
        actionPreview: result.approval?.actionPreview,
        pendingAction: input
      });
      this.deps.appendTrace(record, {
        runId: input.runId,
        type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
        payload: {
          request: this.deps.approvalRequestForTrace(request),
          summary: `${request.reason}; action was not executed`
        }
      });
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'waiting_for_approval',
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        pendingApproval: request,
        trace: record.trace
      });
      return result;
    }

    if (contract) {
      const authorizationService = this.deps.authorizationService ??
        new AuthorizationService(this.deps.toolPolicy);
      const authorization = authorizationService.authorize(await this.buildAuthorizationContext(
        input,
        record,
        contract,
        approvalArgsPreview
      ));
      if (!authorization.allow && !authorization.requiresApproval) {
        const result: ToolResult = {
          ok: false,
          code: authorization.code,
          summary: authorization.reason,
          changedPage: false,
          requiresObserve: false,
          error: { message: authorization.reason }
        };
        this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, result));
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_user',
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          trace: record.trace
        });
        return result;
      }
      if (!authorization.allow && authorization.requiresApproval) {
        const result = this.deps.approvalRequiredResultFn({
          reason: authorization.reason,
          risk: authorization.risk,
          actionPreview: authorization.actionPreview
        });
        const request = this.createApprovalRequest(input, {
          runId: input.runId, stepId: `${input.runId}:${input.tool}`, tool: input.tool,
          argsPreview: approvalArgsPreview, risk: authorization.risk,
          reason: result.approval?.reason ?? result.summary,
          actionPreview: result.approval?.actionPreview,
          pendingAction: input
        });
        this.deps.appendTrace(record, {
          runId: input.runId, type: TRACE_EVENT_NAMES.APPROVAL_REQUIRED,
          payload: {
            request: this.deps.approvalRequestForTrace(request),
            summary: `${request.reason}; action was not executed`
          }
        });
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_approval',
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          pendingApproval: request,
          trace: record.trace
        });
        return result;
      }
    }

    const beforeEvents = adapter.beforeExecution(input, redactedArgs);
    this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, redactedArgs));
    for (const evt of beforeEvents) this.deps.appendTrace(record, evt);

    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: 'executing_tool',
      trace: record.trace
    });

    const visionClient = isVisionTool(input.tool) ? await this.deps.createVisionClient?.() : undefined;
    const result = await router.execute(
      { tool: input.tool, args: input.args },
      {
        runId: input.runId,
        stepId: `${input.runId}:${input.tool}`,
        tabId: record.tabId,
        runMode: record.mode,
        snapshot: this.deps.getSnapshot(input.runId),
        ...(visionClient ? { visionClient } : {})
      }
    );

    // Emit result event
    this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, result));
    if (input.tool === TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH) {
      const report = this.deps.getSnapshot(input.runId).debugReport;
      if (report) {
        this.deps.appendTrace(record, {
          runId: input.runId,
          type: TRACE_EVENT_NAMES.DEBUG_REPORT_CREATED,
          payload: { report }
        });
      }
    }

    // Emit post-execution events via adapter
    const afterEvents = adapter.afterExecution(input, result);
    for (const evt of afterEvents) this.deps.appendTrace(record, evt);

    if (!result.ok && await this.handleRecovery(input, record, router, result, contract)) {
      return result;
    }

    // Handle requiresApproval from tool result
    if (result.requiresApproval) {
      const request = this.createApprovalRequest(input, {
        runId: input.runId, stepId: `${input.runId}:${input.tool}`, tool: input.tool,
        argsPreview: approvalArgsPreview, risk: result.approval?.risk ?? 'high',
        reason: result.approval?.reason ?? result.summary,
        actionPreview: result.approval?.actionPreview,
        pendingAction: input
      });
      const approvalEvents = adapter.afterApprovalRequested(input, result);
      for (const evt of approvalEvents) this.deps.appendTrace(record, evt);
      this.deps.appendTrace(record, approvalRequiredEvent(input.runId, request, request.reason));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'waiting_for_approval',
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        pendingApproval: request,
        trace: record.trace
      });
      return result;
    }

    // Normal result — success or error
    const nonBlockingFailure = isNonBlockingToolFailure(result);
    this.deps.setSnapshot(input.runId, {
      ...this.deps.getSnapshot(input.runId),
      status: result.ok || nonBlockingFailure ? 'observed' : 'error',
      toolResult: this.deps.snapshotToolResult(input.tool, result),
      pendingApproval: undefined,
      trace: record.trace,
      ...(result.ok || nonBlockingFailure ? {} : {
        error: { code: result.code, message: result.error?.message ?? result.summary }
      })
    });

    return result;
  }

  private getAdapter(tool: string): ToolRuntimeAdapter {
    const adapters = this.deps.adapters ?? (this.deps.adapter ? [this.deps.adapter] : []);
    const adapter = adapters.find((candidate) => candidate.supports?.(tool) === true) ??
      adapters.at(-1);
    if (!adapter) {
      throw new Error('ToolExecutionService requires at least one tool runtime adapter');
    }
    return adapter;
  }

  private createApprovalRequest(
    input: ExecuteToolInput,
    request: {
      runId: string;
      stepId: string;
      tool: string;
      argsPreview: unknown;
      risk: ApprovalRequest['risk'];
      reason: string;
      actionPreview?: string | undefined;
      pendingAction: ExecuteToolInput;
    }
  ): ApprovalRequest {
    const coordinator = this.deps.approvalCoordinator ??
      new ApprovalCoordinator({
        approvalManager: this.deps.approvalManager,
        setPendingAction: (requestId, pendingInput) =>
          this.deps.setPendingAction(requestId, pendingInput)
      });
    return coordinator.createRequest({
      ...request,
      pendingAction: input
    }).request;
  }

  private async buildAuthorizationContext(
    input: ExecuteToolInput,
    record: NonNullable<ReturnType<ToolExecutionDeps['getRecord']>>,
    contract: {
      name?: string | undefined;
      title: string;
      risk: ToolAuthorizationContext['risk'];
      readOnly?: boolean | undefined;
      requiresApproval?: boolean | undefined;
    },
    argsPreview: unknown
  ): Promise<ToolAuthorizationContext> {
    const snapshot = this.deps.getSnapshot(input.runId);
    const domainOperation = this.deps.getDomainPolicy
      ? domainOperationForTool(input.tool)
      : undefined;
    const capabilities = snapshot.capabilities;
    const requiredCapability = capabilities ? requiredCapabilityForTool(input.tool) : undefined;
    const changedPageExpected = changedPageExpectedForTool(input.tool, contract.readOnly);
    const source = input.source ?? 'runtime';
    const userIntent = userIntentForTool(input.tool, input.args, record.task, snapshot, source);
    const firstMutationRequiresApproval =
      source === 'agent' &&
      changedPageExpected &&
      userIntent?.grounded !== true &&
      requiresFirstMutationApproval(input.tool, record.trace);
    return {
      runId: input.runId,
      tool: input.tool,
      title: contract.title,
      argsPreview,
      runMode: record.mode,
      risk: contract.risk,
      readOnly: contract.readOnly ?? false,
      requiresApproval: contract.requiresApproval ?? false,
      ...(adapterShouldBypassPolicyApproval(this.getAdapter(input.tool), input.tool)
        ? { bypassPolicyApproval: true }
        : {}),
      ...(changedPageExpected ? { changedPageExpected } : {}),
      source,
      userTask: record.task,
      ...(snapshot.observation?.currentDomain
        ? { pageDomain: snapshot.observation.currentDomain }
        : {}),
      ...(domainOperation ? { domainOperation } : {}),
      ...(domainOperation && this.deps.getDomainPolicy
        ? { domainPolicy: await this.deps.getDomainPolicy() }
        : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(requiredCapability ? { requiredCapability } : {}),
      ...(userIntent ? { userIntent } : {}),
      ...(firstMutationRequiresApproval ? { firstMutationRequiresApproval } : {})
    };
  }

  private async handleRecovery(
    input: ExecuteToolInput,
    record: NonNullable<ReturnType<ToolExecutionDeps['getRecord']>>,
    router: ToolRouter,
    result: ToolResult,
    contract: { argsSchema?: unknown } | undefined
  ): Promise<boolean> {
    if (result.code === ERROR_CODES.REF_STALE || result.code === ERROR_CODES.PAGE_CHANGED) {
      const recovery = recoveryState('re_observe', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      this.deps.appendTrace(record, toolStartedEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, { reason: 're_observe' }));
      const observeResult = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId: input.runId, stepId: `${input.runId}:recovery_observe`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, observeResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: 'observed',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, result),
        trace: record.trace
      });
      return true;
    }

    if (result.code === ERROR_CODES.TOOL_ARGS_INVALID) {
      const recovery = recoveryState('repair_tool_args', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      const repairedArgs = repairArgs(input.args, contract?.argsSchema);
      if (!repairedArgs) {
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_user',
          canReviseGoal: true,
          recovery: { ...recovery, limitation: 'Tool arguments could not be repaired deterministically' },
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          trace: record.trace
        });
        return true;
      }
      this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, { recovery: 'repair_tool_args', args: redactToolArgs(input.tool, repairedArgs) }));
      const retryResult = await router.execute(
        { tool: input.tool, args: repairedArgs },
        { runId: input.runId, stepId: `${input.runId}:${input.tool}:recovery_retry`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, retryResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: retryResult.ok ? 'observed' : 'waiting_for_user',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, retryResult),
        trace: record.trace
      });
      return true;
    }

    if (result.code === ERROR_CODES.ELEMENT_NOT_FOUND) {
      const recovery = recoveryState('find_alternative_ref', result.code);
      this.deps.appendTrace(record, { runId: input.runId, type: TRACE_EVENT_NAMES.RECOVERY_ACTION, payload: { recovery } });
      this.deps.appendTrace(record, toolStartedEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, { reason: 'find_alternative_ref' }));
      const observeResult = await router.execute(
        { tool: TOOL_NAMES.PAGE_OBSERVE, args: {} },
        { runId: input.runId, stepId: `${input.runId}:recovery_observe`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, TOOL_NAMES.PAGE_OBSERVE, observeResult));
      const alternative = findAlternativeRef(input.args, observeResult.data);
      if (!alternative) {
        this.deps.setSnapshot(input.runId, {
          ...this.deps.getSnapshot(input.runId),
          status: 'waiting_for_user',
          canReviseGoal: true,
          recovery: { ...recovery, limitation: 'No deterministic alternative ref candidate found' },
          toolResult: this.deps.snapshotToolResult(input.tool, result),
          trace: record.trace
        });
        return true;
      }
      const retryArgs = { ...(input.args), refId: alternative.refId };
      this.deps.appendTrace(record, toolStartedEvent(input.runId, input.tool, { recovery: 'find_alternative_ref', args: redactToolArgs(input.tool, retryArgs) }));
      const retryResult = await router.execute(
        { tool: input.tool, args: retryArgs },
        { runId: input.runId, stepId: `${input.runId}:${input.tool}:recovery_retry`, runMode: record.mode }
      );
      this.deps.appendTrace(record, toolResultEvent(input.runId, input.tool, retryResult));
      this.deps.setSnapshot(input.runId, {
        ...this.deps.getSnapshot(input.runId),
        status: retryResult.ok ? 'observed' : 'waiting_for_user',
        recovery,
        toolResult: this.deps.snapshotToolResult(input.tool, retryResult),
        trace: record.trace
      });
      return true;
    }

    return false;
  }
}

function recoveryState(type: 're_observe' | 'repair_tool_args' | 'find_alternative_ref', reason: string) {
  return { action: { type, reason }, attempts: 1, budgetRemaining: 0 };
}

function isHiddenIframeMutationTool(tool: string): boolean {
  return tool === INTERNAL_TOOL_NAMES.IFRAME_CLICK || tool === INTERNAL_TOOL_NAMES.IFRAME_TYPE;
}

function isVisionTool(tool: string): boolean {
  return tool.startsWith('bh_vision_');
}

function isNonBlockingToolFailure(result: ToolResult): boolean {
  return result.code === ERROR_CODES.VISION_UNAVAILABLE;
}

function domainOperationForTool(tool: string): BrowserHelmDomainPolicyOperation | undefined {
  if (tool === TOOL_NAMES.FORM_FILL_FIELD || tool === TOOL_NAMES.FORM_FILL_MANY) {
    return 'form_fill';
  }
  if (tool.startsWith('bh_form_submit')) {
    return 'submit';
  }
  if (tool === TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH || tool.startsWith('bh_cdp_')) {
    return 'debug_hook';
  }
  if (tool === TOOL_NAMES.STORAGE_LIST || tool === TOOL_NAMES.STORAGE_GET) {
    return 'storage_read';
  }
  if (
    tool === TOOL_NAMES.FLOW_RUN_WITH_APPROVAL ||
    tool === TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL ||
    tool === TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL ||
    tool === TOOL_NAMES.STORAGE_SET_WITH_APPROVAL ||
    tool === TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL ||
    tool === TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
  ) {
    return 'advanced_action';
  }
  if (
    tool === TOOL_NAMES.ACTION_CLICK ||
    tool === TOOL_NAMES.POINTER_CLICK ||
    tool === TOOL_NAMES.TAB_FOCUS
  ) {
    return 'advanced_action';
  }
  return undefined;
}

function adapterShouldBypassPolicyApproval(adapter: ToolRuntimeAdapter, tool: string): boolean {
  return adapter.shouldBypassPolicyApproval?.(tool) === true;
}

function requiredCapabilityForTool(tool: string): RuntimeCapabilityRequirement | undefined {
  if (tool.startsWith('bh_cdp_')) {
    return 'debugger';
  }
  if (tool === TOOL_NAMES.DEBUG_COLLECT_PAGE_HEALTH) {
    return 'shallowDebug';
  }
  if (tool.startsWith('bh_clipboard_')) {
    return 'clipboard';
  }
  if (tool.startsWith('bh_download_') || tool.startsWith('bh_file_')) {
    return 'downloads';
  }
  if (tool.startsWith('bh_storage_')) {
    return 'storageInspection';
  }
  return undefined;
}

function changedPageExpectedForTool(tool: string, readOnly: boolean | undefined): boolean {
  if (readOnly === true) {
    return false;
  }
  return tool === TOOL_NAMES.ACTION_CLICK ||
    tool === TOOL_NAMES.POINTER_CLICK ||
    tool === TOOL_NAMES.FORM_FILL_FIELD ||
    tool === TOOL_NAMES.FORM_FILL_MANY ||
    tool.startsWith('bh_form_submit') ||
    tool === TOOL_NAMES.TAB_FOCUS;
}

function userIntentForTool(
  tool: string,
  args: unknown,
  userTask: string,
  snapshot: RunSnapshot,
  source: NonNullable<ToolAuthorizationContext['source']>
): ToolAuthorizationContext['userIntent'] | undefined {
  if (tool === TOOL_NAMES.ACTION_CLICK) {
    const targetName = actionClickTargetName(args, snapshot);
    if (!targetName || !isExplicitTaskValue(userTask, targetName, snapshot, undefined)) {
      return undefined;
    }
    return {
      required: true,
      grounded: true,
      reason: 'Click target is explicit in the user task'
    };
  }
  if (tool !== TOOL_NAMES.FORM_FILL_FIELD && tool !== TOOL_NAMES.FORM_FILL_MANY) {
    return undefined;
  }
  if (source !== 'agent') {
    return undefined;
  }
  const fields = formFillFieldsForIntent(tool, args);
  if (!fields?.length) {
    return {
      required: true,
      grounded: false,
      reason: 'Form fill values must be explicit in the user task'
    };
  }
  const missingExplicitValue = fields.find((field) =>
    !isExplicitTaskValue(userTask, field.value, snapshot, field.fieldRefId)
  );
  if (missingExplicitValue) {
    return {
      required: true,
      grounded: false,
      reason: 'Form fill value is not explicit in the user task'
    };
  }
  return {
    required: true,
    grounded: true,
    reason: 'Every form fill value is explicit in the user task'
  };
}

function actionClickTargetName(args: unknown, snapshot: RunSnapshot): string | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  const refId = (args as Record<string, unknown>).refId;
  if (typeof refId !== 'string') {
    return undefined;
  }
  return snapshot.refs?.find((ref) => ref.refId === refId)?.name;
}

function formFillFieldsForIntent(
  tool: string,
  args: unknown
): Array<{ fieldRefId?: string | undefined; value: string }> | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    return undefined;
  }
  const record = args as Record<string, unknown>;
  if (tool === TOOL_NAMES.FORM_FILL_FIELD) {
    const value = formFillValue(record.value);
    return value === undefined
      ? undefined
      : [{
          ...(typeof record.fieldRefId === 'string' ? { fieldRefId: record.fieldRefId } : {}),
          value
        }];
  }
  const fields = record.fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }
  const values: Array<{ fieldRefId?: string | undefined; value: string }> = [];
  for (const field of fields) {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      return undefined;
    }
    const item = field as Record<string, unknown>;
    const value = formFillValue(item.value);
    if (value === undefined) {
      return undefined;
    }
    values.push({
      ...(typeof item.fieldRefId === 'string' ? { fieldRefId: item.fieldRefId } : {}),
      value
    });
  }
  return values;
}

function formFillValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return undefined;
}

function isExplicitTaskValue(
  userTask: string,
  value: string,
  snapshot: RunSnapshot,
  fieldRefId: string | undefined
): boolean {
  const normalizedValue = normalizeIntentText(value);
  if (normalizedValue.length === 0) {
    return false;
  }
  const normalizedTask = normalizeIntentText(userTask);
  if (normalizedTask.includes(normalizedValue)) {
    return true;
  }
  if (selectOptionMentionsForValue(snapshot, fieldRefId, value).some((mention) =>
    normalizedTask.includes(normalizeIntentText(mention))
  )) {
    return true;
  }
  if (normalizedValue !== 'false') {
    return false;
  }
  const optOutMentions = [
    'do not subscribe',
    "don't subscribe",
    'opt out',
    'unsubscribe',
    'no marketing',
    '不要订阅',
    '不订阅',
    '取消订阅',
    '不要勾选',
    '不勾选',
    '取消勾选'
  ];
  return optOutMentions.some((mention) => normalizedTask.includes(mention));
}

function selectOptionMentionsForValue(
  snapshot: RunSnapshot,
  fieldRefId: string | undefined,
  value: string
): string[] {
  if (!fieldRefId) {
    return [];
  }
  const field = snapshot.structuredPageData?.forms.items.find((item) => item.refId === fieldRefId);
  const normalizedValue = normalizeIntentText(value);
  const mentions = new Set<string>();
  for (const option of field?.writable?.options ?? []) {
    const optionValue = normalizeIntentText(option.value);
    const optionLabel = normalizeIntentText(option.label);
    if (optionValue === normalizedValue || optionLabel === normalizedValue) {
      mentions.add(option.value);
      mentions.add(option.label);
      for (const alias of countryAliases(option.value, option.label)) {
        mentions.add(alias);
      }
    }
  }
  return [...mentions].filter(Boolean);
}

function countryAliases(value: string, label: string): string[] {
  const normalized = normalizeIntentText(`${value} ${label}`);
  if (/\b(usa|us|united states|united states of america)\b/u.test(normalized) || normalized.includes('美国')) {
    return ['USA', 'US', 'United States', 'United States of America', '美国'];
  }
  return [];
}

function normalizeIntentText(value: string): string {
  return value
    .replace(/[""'"'‘’]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase();
}

function requiresFirstMutationApproval(tool: string, trace: RuntimeEvent[]): boolean {
  if (tool !== TOOL_NAMES.ACTION_CLICK && tool !== TOOL_NAMES.POINTER_CLICK) {
    return false;
  }
  return !trace.some((event) => {
    if (event.type !== TRACE_EVENT_NAMES.TOOL_RESULT || typeof event.payload !== 'object' || event.payload === null) {
      return false;
    }
    return (event.payload as { changedPage?: unknown }).changedPage === true;
  });
}

function repairArgs(args: unknown, argsSchema: unknown): Record<string, unknown> | undefined {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined;
  const properties = typeof argsSchema === 'object' && argsSchema !== null
    ? (argsSchema as { properties?: Record<string, { type?: string }> }).properties
    : undefined;
  if (!properties) return undefined;
  const repaired: Record<string, unknown> = { ...(args as Record<string, unknown>) };
  let changed = false;
  for (const [key, spec] of Object.entries(properties)) {
    const value = repaired[key];
    if (spec.type === 'integer' && typeof value === 'string' && /^-?\d+$/u.test(value)) {
      repaired[key] = Number.parseInt(value, 10);
      changed = true;
    }
    if (spec.type === 'boolean' && typeof value === 'string' && /^(true|false)$/iu.test(value)) {
      repaired[key] = value.toLowerCase() === 'true';
      changed = true;
    }
  }
  return changed ? repaired : undefined;
}

function findAlternativeRef(args: unknown, data: unknown): { refId: string } | undefined {
  const source = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {};
  const oldRef = typeof source.refId === 'string' ? source.refId : undefined;
  const role = typeof source.role === 'string' ? source.role : undefined;
  const name = typeof source.name === 'string' ? source.name : undefined;
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const refs = Array.isArray(record.refSummary) ? record.refSummary : [];
  for (const item of refs) {
    if (typeof item !== 'object' || item === null) continue;
    const ref = item as Record<string, unknown>;
    if (typeof ref.refId !== 'string') continue;
    if (
      ref.refId !== oldRef &&
      ref.visible !== false &&
      (!role || ref.role === role) &&
      (!name || ref.name === name)
    ) {
      return { refId: ref.refId };
    }
  }
  return undefined;
}
