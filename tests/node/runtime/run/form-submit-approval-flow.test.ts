import { describe, expect, it, vi } from 'vitest';

import { FormSubmitApprovalFlow } from '../../../../src/background/runtime/run/tools/approval/flows/form-submit-approval-flow';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { buildSubmitApprovalSnapshotDigest } from '../../../../src/shared/schemas/approval-snapshot-digest.schema';
import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import type { ContentRpcRequest, ContentRpcResponse } from '../../../../src/page/messaging/content-rpc.schema';
import type { ToolRouter } from '../../../../src/tools/core/tool-router';

describe('FormSubmitApprovalFlow', () => {
  it('fails closed when re-verify field label changes after approval', async () => {
    const snapshotDigest = buildSubmitApprovalSnapshotDigest({
      formRefId: 'form_1',
      fieldRefIds: ['email_1'],
      submitTargetRefId: 'submit_1',
      formAction: '/register',
      formMethod: 'post',
      fields: [
        { fieldRefId: 'email_1', label: 'Email', type: 'email', valuePreview: 'non-empty', isSensitive: false }
      ]
    });
    const requests: ContentRpcRequest[] = [];
    const rpc: ContentRpcClient = {
      request: vi.fn(async (message: ContentRpcRequest): Promise<ContentRpcResponse> => {
        requests.push(message);
        if (message.type === CONTENT_RPC_MESSAGES.FORM_VERIFY) {
          return {
            ok: true,
            verifyResult: {
              status: 'pass',
              formRefId: 'form_1',
              formAction: '/register',
              formMethod: 'post',
              submitTargetRefId: 'submit_1',
              allValid: true,
              missingRequired: [],
              invalidFields: [],
              fieldResults: [
                {
                  fieldRefId: 'email_1',
                  label: 'Work email',
                  name: 'email',
                  type: 'email',
                  valid: true,
                  required: true,
                  filled: true,
                  actualValuePreview: 'non-empty',
                  maskedActualValue: '[MASKED]'
                }
              ],
              visibleErrorText: [],
              submitAvailable: true,
              warnings: []
            }
          };
        }
        if (message.type === CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE) {
          return { ok: true, actionToken: 'token' };
        }
        return { ok: true, submitResult: 'submitted' };
      })
    };
    const flow = new FormSubmitApprovalFlow({
      getRecord: () => ({ task: 'submit', mode: 'form', tabId: 1, trace: [] }),
      getPendingAction: () => ({
        runId: 'run_1',
        tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
        args: {
          formRefId: 'form_1',
          submitTargetRefId: 'submit_1',
          verifyFailed: false,
          fields: [{ fieldRefId: 'email_1' }],
          snapshotDigest
        }
      }),
      deletePendingAction: vi.fn(),
      createContentRpcClient: () => rpc,
      createToolRouter: () => ({
        execute: vi.fn()
      } as unknown as ToolRouter),
      appendTrace: vi.fn(),
      setSnapshot: vi.fn(),
      getSnapshot: () => ({ runId: 'run_1', mode: 'form', status: 'waiting_for_approval' })
    });

    const result = await flow.onApproved({
      runId: 'run_1',
      requestId: 'apr_1',
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL
    });

    expect(result).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_CONTEXT_STALE
    });
    expect(requests.map((request) => request.type)).not.toContain(CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT);
  });
});
