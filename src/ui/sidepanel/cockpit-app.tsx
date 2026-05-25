import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import type { RuntimeToolExecutionResult, RunSnapshot } from '../../runtime/runtime-messages';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import { ApprovalDrawer } from '../approval/approval-drawer';
import { ChatPanel } from '../components/chat-panel';
import { CockpitFooter } from '../components/cockpit-footer';
import { CockpitShell } from '../components/cockpit-shell';
import { DiagnosisOverview } from '../components/diagnosis-overview';
import { FormFieldsTab } from '../components/form-fields-tab';
import { InteractiveElementsTab } from '../components/interactive-elements-tab';
import { PageObservationTab } from '../components/page-observation-tab';
import { RefMapTab } from '../components/ref-map-tab';
import { SettingsPanel } from '../components/settings-panel';
import { StepTimeline } from '../components/step-timeline';
import { ToolInspector } from '../components/tool-inspector';
import { TraceLog } from '../components/trace-log';
import { toTimelineItems } from '../lib/timeline-groups';
import { createAgentStore } from '../stores/agent-store';
import { createApprovalStore } from '../stores/approval-store';
import { createPageDataStore } from '../stores/page-data-store';
import { createSettingsStore } from '../stores/settings-store';
import { createTraceStore } from '../stores/trace-store';
import type { RunDisplayState } from '../stores/agent-store';
import type { SimpleStore } from '../stores/store-core';

type CockpitAppProps = {
  runtime: RuntimePort;
  targetTabId?: number | undefined;
  initialRunId?: string | undefined;
};

type CockpitTab = 'observation' | 'refs' | 'interactive' | 'forms';

export function CockpitApp({ runtime, targetTabId, initialRunId }: CockpitAppProps) {
  const [task, setTask] = useState('观察当前页面');
  const [mode, setMode] = useState<RunMode>('ask');
  const [busy, setBusy] = useState(false);
  const [approvalResult, setApprovalResult] = useState<RuntimeToolExecutionResult>();
  const [activeTab, setActiveTab] = useState<CockpitTab>('observation');
  const unsubscribeRunRef = useRef<(() => void) | undefined>(undefined);
  const agentStore = useMemo(() => createAgentStore(), []);
  const pageDataStore = useMemo(() => createPageDataStore(), []);
  const traceStore = useMemo(() => createTraceStore(), []);
  const approvalStore = useMemo(() => createApprovalStore(), []);
  const settingsStore = useMemo(() => createSettingsStore(runtime), [runtime]);
  const agentState = useStore(agentStore);
  const pageDataState = useStore(pageDataStore);
  const traceState = useStore(traceStore);
  const approvalState = useStore(approvalStore);
  const settingsState = useStore(settingsStore);
  const snapshot = pageDataState.snapshot;
  const trace = traceState.events;
  const timelineItems = useMemo(() => toTimelineItems(trace), [trace]);
  const structuredPageData = snapshot?.structuredPageData ?? emptyStructuredPageData();
  const runDisplayState = busy ? 'starting' : agentState.displayState;

  const applySnapshot = useCallback((nextSnapshot: RunSnapshot) => {
    pageDataStore.getState().setSnapshot(nextSnapshot);
    traceStore.getState().setEvents(nextSnapshot.trace ?? []);
    if (nextSnapshot.pendingApproval) {
      approvalStore.getState().setPending(nextSnapshot.pendingApproval);
    } else {
      approvalStore.getState().clearPending();
    }
    agentStore.getState().setDisplayState(statusToDisplayState(nextSnapshot.status, false));
  }, [agentStore, approvalStore, pageDataStore, traceStore]);

  const subscribeToRun = useCallback((runId: string) => {
    unsubscribeRunRef.current?.();
    unsubscribeRunRef.current = runtime.subscribeRun(runId, () => {
      void runtime.getRunSnapshot(runId).then(applySnapshot);
    });
  }, [applySnapshot, runtime]);

  useEffect(() => {
    void settingsStore.getState().load();
  }, [settingsStore]);

  useEffect(() => () => {
    unsubscribeRunRef.current?.();
  }, []);

  useEffect(() => {
    if (!initialRunId) {
      return;
    }
    let active = true;
    subscribeToRun(initialRunId);
    void runtime.getRunSnapshot(initialRunId).then((nextSnapshot) => {
      if (!active) {
        return;
      }
      applySnapshot(nextSnapshot);
      setMode(nextSnapshot.mode);
    });
    return () => {
      active = false;
    };
  }, [applySnapshot, runtime, initialRunId, subscribeToRun]);

  useEffect(() => {
    if (!targetTabId) {
      return undefined;
    }
    let active = true;
    const timers: number[] = [];
    const retryDelays = [500, 1_500, 3_000, 6_000];
    const observe = (attempt: number) => {
      void runtime
        .startRun({ task: '观察当前页面', mode: 'ask', tabId: targetTabId })
        .then((started) => {
          subscribeToRun(started.runId);
          return runtime.getRunSnapshot(started.runId);
        })
        .then((nextSnapshot) => {
          if (!active) {
            return;
          }
          applySnapshot(nextSnapshot);
          setMode(nextSnapshot.mode);
          if (
            attempt < retryDelays.length &&
            shouldRetryAutoObserve(nextSnapshot)
          ) {
            timers.push(window.setTimeout(() => observe(attempt + 1), retryDelays[attempt]));
          }
        });
    };
    observe(0);
    return () => {
      active = false;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [applySnapshot, runtime, subscribeToRun, targetTabId]);

  const start = async () => {
    setBusy(true);
    setApprovalResult(undefined);
    try {
      const started = await runtime.startRun({ task, mode, tabId: targetTabId });
      agentStore.getState().startRun({ runId: started.runId, mode });
      subscribeToRun(started.runId);
      const nextSnapshot = await runtime.getRunSnapshot(started.runId);
      applySnapshot(nextSnapshot);
      setMode(nextSnapshot.mode);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!snapshot) {
      return;
    }
    await runtime.cancelRun(snapshot.runId);
    agentStore.getState().cancelRun();
    applySnapshot(await runtime.getRunSnapshot(snapshot.runId));
  };

  const decide = async (decision: 'approved' | 'denied') => {
    const currentSnapshot = snapshot;
    const pendingApproval = currentSnapshot?.pendingApproval;
    if (!currentSnapshot || !pendingApproval) {
      return;
    }
    approvalStore.getState().startDecision(decision);
    const result = await runtime.decideApproval({
      runId: currentSnapshot.runId,
      requestId: pendingApproval.id,
      decision,
      ...(decision === 'denied' ? { reason: '用户拒绝' } : {})
    });
    if (!result.ok) {
      approvalStore.getState().failDecision(result.code);
    }
    setApprovalResult(result);
    applySnapshot(await runtime.getRunSnapshot(currentSnapshot.runId));
  };

  const saveSettings = async (nextSettings: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  }) => {
    await settingsStore.getState().save(nextSettings);
  };

  return (
    <CockpitShell
      header={
        <div className="bh-cockpitTitleBar">
          <span className="bh-brandMark" aria-hidden="true">BH</span>
          <div>
            <h1>BrowserHelm Cockpit</h1>
            <p>v0.4 页面数据驾驶舱</p>
          </div>
          <span className="bh-leafMark" aria-hidden="true" />
          <span className="bh-kebabMark" aria-hidden="true" />
        </div>
      }
      task={
        <ChatPanel
          task={task}
          mode={mode}
          runState={runDisplayState}
          busy={busy}
          canStop={snapshot ? snapshot.status !== 'cancelled' : false}
          onTaskChange={setTask}
          onModeChange={setMode}
          onStart={() => {
            void start();
          }}
          onStop={() => {
            void stop();
          }}
        />
      }
      tabs={
        <section>
          <nav aria-label="Cockpit tabs">
            <button
              type="button"
              aria-selected={activeTab === 'observation'}
              onClick={() => setActiveTab('observation')}
            >
              页面观察
            </button>
            <button
              type="button"
              aria-selected={activeTab === 'refs'}
              onClick={() => setActiveTab('refs')}
            >
              Ref 映射
            </button>
            <button
              type="button"
              aria-selected={activeTab === 'interactive'}
              onClick={() => setActiveTab('interactive')}
            >
              交互元素
            </button>
            <button
              type="button"
              aria-selected={activeTab === 'forms'}
              onClick={() => setActiveTab('forms')}
            >
              表单字段
            </button>
          </nav>
          <div data-active-tab={activeTab}>
            {activeTab === 'observation' ? (
              <PageObservationTab data={structuredPageData.observation} />
            ) : null}
            {activeTab === 'refs' ? <RefMapTab data={structuredPageData.refs} /> : null}
            {activeTab === 'interactive' ? (
              <InteractiveElementsTab data={structuredPageData.interactive} />
            ) : null}
            {activeTab === 'forms' ? <FormFieldsTab data={structuredPageData.forms} /> : null}
          </div>
        </section>
      }
      timeline={
        <>
          <StepTimeline items={timelineItems} />
          <TraceLog events={trace} />
        </>
      }
      inspector={
        <>
          <DiagnosisOverview snapshot={snapshot} />
          <ToolInspector
            toolResult={snapshot?.toolResult}
            argsPreview={snapshot?.pendingApproval?.argsPreview}
          />
        </>
      }
      approval={
        approvalState.pending || approvalResult ? (
          <>
            <ApprovalDrawer
              request={approvalState.pending}
              decision={toDrawerDecision(approvalState.decision)}
              decisionError={approvalState.decisionError ?? (approvalResult?.ok === false ? approvalResult.code : undefined)}
              onApprove={() => {
                void decide('approved');
              }}
              onDeny={() => {
                void decide('denied');
              }}
            />
            {approvalResult ? <p>{approvalResult.code}</p> : null}
          </>
        ) : undefined
      }
      settings={
        <SettingsPanel
          baseUrl={settingsState.settings?.baseUrl ?? ''}
          model={settingsState.settings?.model ?? ''}
          maskedApiKey={settingsState.maskedApiKey ?? ''}
          policyPlaceholders={settingsState.policyPlaceholders}
          onSave={(nextSettings) => {
            void saveSettings(nextSettings);
          }}
        />
      }
      footer={<CockpitFooter runId={snapshot?.runId} />}
    />
  );
}

function useStore<T extends object>(store: SimpleStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

function toDrawerDecision(
  decision: 'pending' | 'approved' | 'denied' | 'expired' | undefined
): 'approved' | 'denied' | undefined {
  return decision === 'approved' || decision === 'denied' ? decision : undefined;
}

function shouldRetryAutoObserve(snapshot: RunSnapshot): boolean {
  if (snapshot.status === 'observing' || snapshot.status === 'executing_tool') {
    return true;
  }
  if (snapshot.status !== 'observed' && snapshot.status !== 'empty') {
    return false;
  }
  const observationText = [
    snapshot.observation?.url,
    snapshot.observation?.title,
    snapshot.observation?.visibleTextSummary,
    snapshot.structuredPageData?.observation.summary
  ].join(' ');
  const forms = snapshot.structuredPageData?.forms;
  return /iframe|frame/i.test(observationText) && forms?.status !== 'ready';
}

function statusToDisplayState(
  status: RunSnapshot['status'] | undefined,
  busy: boolean
): RunDisplayState {
  if (busy) {
    return 'starting';
  }
  if (status === 'waiting_for_approval') {
    return 'waiting_for_approval';
  }
  if (
    status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'waiting_for_user' ||
    status === 'recovering' ||
    status === 'finished'
  ) {
    return status;
  }
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  if (status === 'observed' || status === 'empty') {
    return 'finished';
  }
  return 'idle';
}

function emptyStructuredPageData(): StructuredPageData {
  const updatedAt = '2026-05-25T00:00:00.000Z';
  return {
    observation: {
      status: 'empty',
      summary: '等待页面观察',
      count: 0,
      items: [],
      updatedAt,
      warnings: []
    },
    refs: {
      status: 'empty',
      summary: '等待 Ref 映射',
      count: 0,
      items: [],
      updatedAt,
      warnings: []
    },
    interactive: {
      status: 'empty',
      summary: '等待交互元素',
      count: 0,
      items: [],
      updatedAt,
      warnings: []
    },
    forms: {
      status: 'empty',
      summary: '等待表单字段',
      count: 0,
      items: [],
      updatedAt,
      warnings: []
    }
  };
}
