import { describe, expect, it } from 'vitest';

import type { ContentRpcClient } from '../../../../src/page/messaging/content-rpc-client';
import { CONTENT_RPC_MESSAGES } from '../../../../src/shared/constants/event-names';
import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { ToolRegistry } from '../../../../src/tools/core/tool-registry';
import { ToolRouter } from '../../../../src/tools/core/tool-router';
import {
  bhStorageClearWithApproval,
  bhStorageDeleteWithApproval,
  bhStorageGet,
  bhStorageList,
  bhStorageSetWithApproval
} from '../../../../src/tools/storage/bh-storage-tools';

describe('storage advanced tools', () => {
  it('lists Web Storage through content RPC as a medium-risk advanced tool', async () => {
    const requests: unknown[] = [];
    const rpc: ContentRpcClient = {
      request: async (message) => {
        requests.push(message);
        return {
          ok: true,
          storageList: {
            area: 'localStorage',
            count: 1,
            entries: [{
              area: 'localStorage',
              key: 'theme',
              valuePreview: 'dark',
              valueLength: 4,
              masked: false
            }]
          }
        };
      }
    };
    const tool = bhStorageList(rpc);

    expect(tool.name).toBe(TOOL_NAMES.STORAGE_LIST);
    expect(tool.modes).toEqual(['advanced']);
    expect(tool.risk).toBe('medium');
    expect(tool.readOnly).toBe(true);

    const result = await tool.execute({ area: 'localStorage' }, { runId: 'r1', stepId: 's1', runMode: 'full' });

    expect(result.ok).toBe(true);
    expect(result.code).toBe(ERROR_CODES.OK);
    expect(result.summary).toContain('theme=dark');
    expect(requests).toEqual([{
      type: CONTENT_RPC_MESSAGES.STORAGE_LIST,
      area: 'localStorage'
    }]);
  });

  it('gets one Web Storage key as a masked summary', async () => {
    const rpc: ContentRpcClient = {
      request: async () => ({
        ok: true,
        storageGet: {
          area: 'sessionStorage',
          key: 'authToken',
          found: true,
          entry: {
            area: 'sessionStorage',
            key: 'authToken',
            valueLength: 24,
            masked: true,
            reason: 'sensitive_storage_key'
          }
        }
      })
    };

    const result = await bhStorageGet(rpc).execute(
      { area: 'sessionStorage', key: 'authToken' },
      { runId: 'r1', stepId: 's1', runMode: 'full' }
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('authToken=[MASKED]');
    expect(JSON.stringify(result.data)).not.toContain('secret');
  });

  it('includes ordinary storage value previews in the summary for model context and trace evidence', async () => {
    const rpc: ContentRpcClient = {
      request: async () => ({
        ok: true,
        storageGet: {
          area: 'sessionStorage',
          key: 'wizardStep',
          found: true,
          entry: {
            area: 'sessionStorage',
            key: 'wizardStep',
            valuePreview: 'shipping',
            valueLength: 8,
            masked: false
          }
        }
      })
    };

    const result = await bhStorageGet(rpc).execute(
      { area: 'sessionStorage', key: 'wizardStep' },
      { runId: 'r1', stepId: 's1', runMode: 'full' }
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain('wizardStep=shipping');
    expect(result.context?.summary).toContain('wizardStep=shipping');
  });

  it('exposes storage contracts through the registry', () => {
    const rpc: ContentRpcClient = { request: async () => ({ ok: false, code: 'x', message: 'x' }) };
    const registry = new ToolRegistry();
    registry.register(bhStorageList(rpc));
    registry.register(bhStorageGet(rpc));
    registry.register(bhStorageSetWithApproval());
    registry.register(bhStorageDeleteWithApproval());
    registry.register(bhStorageClearWithApproval());
    const router = new ToolRouter(registry);

    expect(router.listToolContracts('full').map((tool) => tool.name)).toEqual([
      TOOL_NAMES.STORAGE_LIST,
      TOOL_NAMES.STORAGE_GET,
      TOOL_NAMES.STORAGE_SET_WITH_APPROVAL,
      TOOL_NAMES.STORAGE_DELETE_WITH_APPROVAL,
      TOOL_NAMES.STORAGE_CLEAR_WITH_APPROVAL
    ]);
  });

  it('requires approval before changing Web Storage values', async () => {
    const setResult = await bhStorageSetWithApproval().execute(
      { area: 'localStorage', key: 'theme', value: 'dark' },
      { runId: 'r1', stepId: 's1', runMode: 'full' }
    );
    const deleteResult = await bhStorageDeleteWithApproval().execute(
      { area: 'sessionStorage', key: 'wizardStep' },
      { runId: 'r1', stepId: 's2', runMode: 'full' }
    );
    const clearResult = await bhStorageClearWithApproval().execute(
      { area: 'localStorage' },
      { runId: 'r1', stepId: 's3', runMode: 'full' }
    );

    expect(setResult).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      changedPage: false
    });
    expect(deleteResult).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      changedPage: false
    });
    expect(clearResult).toMatchObject({
      ok: false,
      code: ERROR_CODES.APPROVAL_REQUIRED,
      requiresApproval: true,
      changedPage: false
    });
    expect(JSON.stringify(setResult)).not.toContain('dark');
  });
});
