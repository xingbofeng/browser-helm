import { useEffect, useMemo, useState } from 'react';
import 'animal-island-ui/style';
import './app.css';

import { ExtensionRuntimePort } from '../../runtime/extension-runtime-port';
import type { RuntimePort } from '../../runtime/runtime-port';
import { SIDE_PANEL_MESSAGES } from '../../shared/constants/event-names';
import { I18nProvider } from '../../i18n/context';
import { readLocale } from '../../i18n/locale';
import type { Locale } from '../../i18n/types';
import { CockpitApp } from '../../ui/sidepanel/cockpit-app';

export function App() {
  const runtime = useMemo<RuntimePort>(() => new ExtensionRuntimePort(), []);
  const search = readCurrentSearch();
  const initialTargetTabId = readNumberSearchParam('tabId');
  const targetMode = resolveTargetModeFromSearch(search);
  const [target, setTarget] = useState({
    tabId: initialTargetTabId,
    revision: 0
  });
  const [locale, setLocale] = useState<Locale>();

  useEffect(() => {
    void readLocale().then(setLocale);
  }, []);

  useEffect(() => {
    if (targetMode !== 'active' || !globalThis.chrome?.runtime?.connect) {
      return undefined;
    }
    const port = chrome.runtime.connect({ name: SIDE_PANEL_MESSAGES.TARGET_PORT });
    const onMessage = (message: unknown) => {
      const tabId = readTargetTabChangedTabId(message);
      if (!tabId) {
        return;
      }
      setTarget((current) => ({
        tabId,
        revision: current.revision + 1
      }));
    };
    port.onMessage.addListener(onMessage);
    return () => {
      port.onMessage.removeListener(onMessage);
      port.disconnect();
    };
  }, [targetMode]);

  return (
    <I18nProvider initialLocale={locale}>
      <CockpitApp
        runtime={runtime}
        targetTabId={target.tabId}
        targetRevision={target.revision}
        initialRunId={readStringSearchParam('runId')}
      />
    </I18nProvider>
  );
}

function readCurrentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function readNumberSearchParam(name: string): number | undefined {
  const search = readCurrentSearch();
  const params = new URLSearchParams(search);
  const value = params.get(name);
  if (value === null || value === undefined) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function readStringSearchParam(name: string): string | undefined {
  const search = readCurrentSearch();
  const params = new URLSearchParams(search);
  return params.get(name) ?? undefined;
}

export function resolveTargetModeFromSearch(search: string): 'active' | 'pinned' {
  const params = new URLSearchParams(search);
  if (params.get('target') === 'active') {
    return 'active';
  }
  return params.has('tabId') || params.get('targetMode') === 'pinned' ? 'pinned' : 'active';
}

export function readTargetTabChangedTabId(message: unknown): number | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const msg = message as Record<string, unknown>;
  if (msg.type !== SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED) return undefined;
  const tabId = msg.tabId;
  return typeof tabId === 'number' && Number.isFinite(tabId) ? tabId : undefined;
}
