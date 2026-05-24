import { useMemo } from 'react';

import { ExtensionRuntimePort } from '../../runtime/extension-runtime-port';
import type { RuntimePort } from '../../runtime/runtime-port';
import { CockpitApp } from '../../ui/sidepanel/cockpit-app';

export {
  readTargetTabChangedTabId,
  resolveTargetModeFromSearch,
  SidePanelView
} from '../../ui/sidepanel/legacy-side-panel-view';

export function App() {
  const runtime = useMemo<RuntimePort>(() => new ExtensionRuntimePort(), []);
  return <CockpitApp runtime={runtime} targetTabId={readTabIdFromLocation()} />;
}

function readTabIdFromLocation(): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = new URLSearchParams(window.location.search).get('tabId');
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
