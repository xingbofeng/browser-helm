import type { RuntimeEvent } from '../../runtime/runtime-messages';
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

const labels: Record<string, string> = {
  run_started: 'Run started',
  approval_required: 'Approval required',
  run_cancelled: 'Run cancelled'
};

export function createTraceStore() {
  const state: TraceStoreState = {
    events: [],
    items: [],
    setEvents: (events) => {
      state.events = events;
      state.items = events.map((event, index) => ({
        id: `${event.runId}:${index}`,
        event,
        label: labels[event.type] ?? event.type
      }));
    },
    selectEvent: (id) => {
      state.selectedEvent = state.items.find((item) => item.id === id)?.event;
    }
  };
  return createSimpleStore(state);
}
