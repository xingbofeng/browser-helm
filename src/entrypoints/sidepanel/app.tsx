import { useMemo } from 'react';
import './app.css';

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
  return (
    <CockpitApp
      runtime={runtime}
      targetTabId={readNumberSearchParam('tabId')}
      initialRunId={readStringSearchParam('runId')}
    />
  );
}

function readNumberSearchParam(name: string): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = new URLSearchParams(window.location.search).get(name);
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readStringSearchParam(name: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return new URLSearchParams(window.location.search).get(name) ?? undefined;
}
