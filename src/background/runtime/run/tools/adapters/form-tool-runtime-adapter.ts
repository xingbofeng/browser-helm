import type { RuntimeEvent } from '../../../../../runtime/runtime-messages';
import type { ExecuteToolInput } from '../../../../../runtime/runtime-messages';
import type { ToolResult } from '../../../../../shared/schemas/tool-result.schema';
import type { ToolRuntimeAdapter } from './tool-runtime-adapter';
import { TOOL_NAMES } from '../../../../../shared/constants/tool-names';
import { TRACE_EVENT_NAMES } from '../../../../../shared/constants/event-names';
import { isRecord, readString } from '../../runtime-event-utils';

export class FormToolRuntimeAdapter implements ToolRuntimeAdapter {
  supports(tool: string): boolean {
    return tool.startsWith('bh_form_');
  }

  shouldBypassPolicyApproval(tool: string): boolean {
    return tool === TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL;
  }

  approvalArgsPreview(input: ExecuteToolInput, redactedArgs: unknown): unknown {
    return input.tool === TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL ? input.args : redactedArgs;
  }

  beforeExecution(input: ExecuteToolInput, redactedArgs: unknown): RuntimeEvent[] {
    if (!isRecord(redactedArgs)) return [];

    if (input.tool === TOOL_NAMES.FORM_FILL_FIELD) {
      const fieldRefId = readString(redactedArgs.fieldRefId);
      if (!fieldRefId) return [];
      return [{
        runId: input.runId,
        type: TRACE_EVENT_NAMES.FIELD_FILL_STARTED,
        payload: { fieldRefId, type: 'unknown' }
      }];
    }

    if (input.tool === TOOL_NAMES.FORM_FILL_MANY && Array.isArray(redactedArgs.fields)) {
      return redactedArgs.fields
        .filter((f): f is Record<string, unknown> => isRecord(f))
        .map((field) => readString(field.fieldRefId))
        .filter(Boolean)
        .map((fieldRefId) => ({
          runId: input.runId,
          type: TRACE_EVENT_NAMES.FIELD_FILL_STARTED,
          payload: { fieldRefId, type: 'unknown' }
        }));
    }

    return [];
  }

  afterExecution(input: ExecuteToolInput, result: ToolResult): RuntimeEvent[] {
    const events: RuntimeEvent[] = [];

    if (input.tool === TOOL_NAMES.FORM_INFER_FILL_PLAN) {
      const data = isRecord(result.data) ? result.data : undefined;
      events.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.FILL_PLAN_CREATED,
        payload: {
          formRefId: readString(data?.formRefId),
          fieldCount: Array.isArray(data?.fields) ? data.fields.length : 0,
          skippedCount: Array.isArray(data?.skippedFields) ? data.skippedFields.length : 0,
          summary: result.summary || 'Fill plan created'
        }
      });
      return events;
    }

    if (input.tool === TOOL_NAMES.FORM_FILL_FIELD || input.tool === TOOL_NAMES.FORM_FILL_MANY) {
      const data = isRecord(result.data) ? result.data : undefined;
      const fields = Array.isArray(data?.fields)
        ? data.fields
        : isRecord(data) && readString(data.fieldRefId)
          ? [data]
          : [];
      for (const field of fields) {
        if (!isRecord(field)) continue;
        const fieldRefId = readString(field.fieldRefId);
        const status = readString(field.status);
        if (!fieldRefId || !status) continue;
        events.push({
          runId: input.runId,
          type: TRACE_EVENT_NAMES.FIELD_FILL_RESULT,
          payload: {
            fieldRefId,
            label: readString(field.label),
            status,
            maskedActualValue: status === 'filled' ? '******' : readString(field.maskedActualValue),
            skipReason: readString(field.skipReason),
            error: readString(field.error),
            retried: field.retried === true ? true : undefined
          }
        });
      }
      return events;
    }

    if (input.tool === TOOL_NAMES.FORM_VERIFY) {
      const data = isRecord(result.data) ? result.data : undefined;
      events.push({
        runId: input.runId,
        type: TRACE_EVENT_NAMES.FORM_VERIFY_RESULT,
        payload: {
          formRefId: readString(data?.formRefId),
          status: readString(data?.status) ?? (result.ok ? 'pass' : 'fail'),
          allValid: data?.allValid === true,
          missingRequiredCount: Array.isArray(data?.missingRequired) ? data.missingRequired.length : 0,
          invalidCount: Array.isArray(data?.invalidFields) ? data.invalidFields.length : 0,
          submitAvailable: data?.submitAvailable === true
        }
      });
    }

    return events;
  }

  afterApprovalRequested(input: ExecuteToolInput, result: ToolResult): RuntimeEvent[] {
    if (input.tool !== TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL || !isRecord(result.data)) {
      return [];
    }
    const formName = readString(result.data.formName);
    const verifyStatus = readString(result.data.verifyStatus);
    if (!formName || !verifyStatus) return [];
    return [{
      runId: input.runId,
      type: TRACE_EVENT_NAMES.SUBMIT_APPROVAL_REQUESTED,
      payload: {
        formRefId: readString(result.data.formRefId),
        formName,
        verifyStatus,
        risk: result.approval?.risk ?? 'high',
        highRisk: result.data.highRisk === true
      }
    }];
  }
}
