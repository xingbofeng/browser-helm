import { useMemo } from 'react';
import 'animal-island-ui/style';
import './app.css';

import { ExtensionRuntimePort } from '../../runtime/extension-runtime-port';
import type { RuntimePort } from '../../runtime/runtime-port';
import { SIDE_PANEL_MESSAGES } from '../../shared/constants/event-names';
import { CockpitApp } from '../../ui/sidepanel/cockpit-app';

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

export function resolveTargetModeFromSearch(search: string): 'active' | 'pinned' {
  const params = new URLSearchParams(search);
  if (params.get('target') === 'active') {
    return 'active';
  }
  return params.has('tabId') ? 'pinned' : 'active';
}

export function readTargetTabChangedTabId(message: unknown): number | undefined {
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }
  const record = message as Record<string, unknown>;
  return record.type === SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED &&
    Number.isInteger(record.tabId) &&
    Number(record.tabId) > 0
    ? Number(record.tabId)
    : undefined;
}
