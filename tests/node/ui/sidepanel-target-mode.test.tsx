import { describe, expect, it } from 'vitest';

import {
  readTargetTabChangedTabId,
  resolveTargetModeFromSearch
} from '../../../src/entrypoints/sidepanel/app';
import { SIDE_PANEL_MESSAGES } from '../../../src/shared/constants/event-names';

describe('side panel target mode', () => {
  it('treats native side panel without query params as active-tab following', () => {
    expect(resolveTargetModeFromSearch('')).toBe('active');
  });

  it('keeps debug side panel urls with tabId pinned to that tab', () => {
    expect(resolveTargetModeFromSearch('?tabId=1499184501')).toBe('pinned');
  });

  it('allows native side panel paths to carry the current tabId while following active tab', () => {
    expect(resolveTargetModeFromSearch('?target=active&tabId=1499184501')).toBe(
      'active'
    );
  });

  it('reads active-tab change messages from the background port', () => {
    expect(
      readTargetTabChangedTabId({
        type: SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED,
        tabId: 1499184501
      })
    ).toBe(1499184501);
    expect(readTargetTabChangedTabId({ type: 'OTHER', tabId: 1499184501 })).toBe(
      undefined
    );
  });
});
