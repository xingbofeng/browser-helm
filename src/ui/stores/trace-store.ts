import type { RuntimeEvent } from '../../runtime/runtime-messages';
import type { Locale } from '../../i18n/types';
import { t } from '../../i18n/t';
import { createSimpleStore } from './store-core';

type TraceItem = {
  id: string;
  event: RuntimeEvent;
  label: string;
};

type TraceStoreState = {
  events: RuntimeEvent[];
  items: TraceItem[];
  selectedEvent?: RuntimeEvent | undefined;
  setEvents: (events: RuntimeEvent[]) => void;
  selectEvent: (id: string) => void;
};

const LABEL_KEYS: Record<string, string> = {
  run_started: 'traceStore.runStarted',
  approval_required: 'traceStore.approvalRequired',
  run_cancelled: 'traceStore.runCancelled'
};

export function createTraceStore(locale: Locale) {
  const store = createSimpleStore<TraceStoreState>({
    events: [],
    items: [],
    setEvents: (events) => {
      store.setState({
        events,
        items: events.map((event, index) => ({
          id: `${event.runId}:${index}`,
          event,
          label: t(LABEL_KEYS[event.type] ?? event.type, locale)
        }))
      });
    },
    selectEvent: (id) => {
      store.setState((state) => ({
        selectedEvent: state.items.find((item) => item.id === id)?.event
      }));
    }
  });
  return store;
}
