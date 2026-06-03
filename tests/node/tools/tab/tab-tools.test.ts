import { afterEach, describe, expect, it, vi } from 'vitest';

import { ERROR_CODES } from '../../../../src/shared/constants/error-codes';
import { TOOL_NAMES } from '../../../../src/shared/constants/tool-names';
import { bhTabFocus, bhTabGetActive, bhTabList } from '../../../../src/tools/tab/bh-tab-tools';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tab tools', () => {
  it('lists current browser tabs as a read-only advanced tool', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{
          id: 21,
          windowId: 1,
          active: true,
          title: 'Inbox',
          url: 'https://mail.example.com/inbox?auth=secret#thread',
          status: 'complete'
        }])
      }
    });

    const result = await bhTabList().execute({}, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false,
      data: {
        tabs: [expect.objectContaining({
          tabId: 21,
          url: 'https://mail.example.com/inbox'
        })]
      }
    });
    expect(JSON.stringify(result.data)).not.toContain('auth=secret');
    expect(result.summary).toContain('tabId=21');
    expect(result.summary).toContain('title=Inbox');
    expect(result.summary).toContain('https://mail.example.com/inbox');
    expect(result.summary).not.toContain('auth=secret');
    expect(result.context?.summary).toContain('tabId=21');
    expect(result.context?.summary).toContain('title=Inbox');
    expect(result.context?.summary).toContain('https://mail.example.com/inbox');
    expect(result.context?.summary).not.toContain('auth=secret');
  });

  it('redacts sensitive URL path content from tab data, summaries, and model context', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{
          id: 24,
          windowId: 1,
          active: false,
          title: 'Reset token',
          url: 'https://accounts.example.com/users/alice@example.com/reset/sk-secretToken123456?token=raw-query-secret#fragment-secret',
          status: 'complete'
        }])
      }
    });

    const result = await bhTabList().execute({}, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });
    const serialized = JSON.stringify({
      data: result.data,
      summary: result.summary,
      context: result.context
    });

    expect(result.data).toMatchObject({
      tabs: [expect.objectContaining({
        url: 'https://accounts.example.com/users/[REDACTED_EMAIL]/reset/[MASKED]'
      })]
    });
    expect(serialized).not.toContain('alice@example.com');
    expect(serialized).not.toContain('sk-secretToken123456');
    expect(serialized).not.toContain('raw-query-secret');
    expect(serialized).not.toContain('fragment-secret');
  });

  it('returns the active tab without changing browser state', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn(async () => [{
          id: 22,
          windowId: 1,
          active: true,
          title: 'Active',
          url: 'https://active.example.com/',
          status: 'complete'
        }])
      }
    });

    const result = await bhTabGetActive().execute({}, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: false
    });
    expect(JSON.stringify(result.data)).toContain('"tabId":22');
    expect(result.summary).toContain('Active tab: tabId=22 title=Active');
    expect(result.context?.summary).toContain('Active tab: tabId=22 title=Active');
  });

  it('focuses a tab and requires re-observe for the new target', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        update: vi.fn(async () => ({
          id: 23,
          windowId: 2,
          active: true,
          title: 'Focused',
          url: 'https://focused.example.com/',
          status: 'complete'
        }))
      },
      windows: { update: vi.fn(async () => ({})) }
    });

    const result = await bhTabFocus().execute({ tabId: 23 }, {
      runId: 'run_1',
      stepId: 'step_1',
      runMode: 'full'
    });

    expect(result).toMatchObject({
      ok: true,
      code: ERROR_CODES.OK,
      changedPage: false,
      requiresObserve: true
    });
    expect(JSON.stringify(result.data)).toContain('"tabId":23');
  });

  it('registers stable v1.5 tab tool names', () => {
    expect(bhTabList().name).toBe(TOOL_NAMES.TAB_LIST);
    expect(bhTabGetActive().name).toBe(TOOL_NAMES.TAB_GET_ACTIVE);
    expect(bhTabFocus().name).toBe(TOOL_NAMES.TAB_FOCUS);
  });
});
