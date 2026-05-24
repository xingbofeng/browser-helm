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
  run_started: 'Run 开始',
  approval_required: '等待审批',
  run_cancelled: '用户停止'
};

export function createTraceStore() {
  const store = createSimpleStore<TraceStoreState>({
    events: [],
    items: [],
    setEvents: (events) => {
      store.setState({
        events,
        items: events.map((event, index) => ({
          id: `${event.runId}:${index}`,
          event,
          label: labels[event.type] ?? event.type
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
