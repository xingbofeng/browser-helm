import { describe, expect, it } from 'vitest';

import {
  sidePanelPathForTab,
  targetTabChangedMessage
} from '../../../src/background/runtime/side-panel-target';
import { SIDE_PANEL_MESSAGES } from '../../../src/shared/constants/event-names';

describe('side panel target binding', () => {
  it('pins the native side panel path to the target tab id', () => {
    expect(sidePanelPathForTab(1499184501)).toBe(
      'sidepanel.html?target=active&tabId=1499184501'
    );
  });

  it('creates active-tab change messages for connected side panels', () => {
    expect(targetTabChangedMessage(1499184501)).toEqual({
      type: SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED,
      tabId: 1499184501
    });
  });
});
