import type { RunSnapshot } from '../../runtime/runtime-messages';
import { createSimpleStore } from './store-core';

type TabStatus = 'ready' | 'empty' | 'partial' | 'error' | 'unsupported';

type PageDataStoreState = {
  snapshot?: RunSnapshot | undefined;
  tabStatuses: {
    observation?: TabStatus | undefined;
    refs?: TabStatus | undefined;
    interactive?: TabStatus | undefined;
    forms?: TabStatus | undefined;
  };
  setSnapshot: (snapshot: RunSnapshot) => void;
};

export function createPageDataStore() {
  const state: PageDataStoreState = {
    tabStatuses: {},
    setSnapshot: (snapshot) => {
      state.snapshot = snapshot;
      state.tabStatuses = {
        observation: snapshot.structuredPageData?.observation.status,
        refs: snapshot.structuredPageData?.refs.status,
        interactive: snapshot.structuredPageData?.interactive.status,
        forms: snapshot.structuredPageData?.forms.status
      };
    }
  };
  return createSimpleStore(state);
}
