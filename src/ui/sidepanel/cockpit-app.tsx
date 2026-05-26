import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Bug, PencilLine, Settings } from 'lucide-react';
import { Button } from 'animal-island-ui';

import type { RuntimeToolExecutionResult, RunSnapshot } from '../../runtime/runtime-messages';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import { ApprovalDrawer } from '../approval/approval-drawer';
import { AdvancedDebugPanel } from '../components/advanced-debug-drawer';
import { AgentMessageList } from '../components/agent-message-list';
import { ChatPanel } from '../components/chat-panel';
import { ModelConfigForm } from '../components/model-config-modal';
import { createAgentStore } from '../stores/agent-store';
import { createApprovalStore } from '../stores/approval-store';
import { createPageDataStore } from '../stores/page-data-store';
import { createSettingsStore } from '../stores/settings-store';
import { createTraceStore } from '../stores/trace-store';
import type { RunDisplayState } from '../stores/agent-store';
import type { SimpleStore } from '../stores/store-core';

const browserHelmLogoUrl = new URL('../assets/browserhelm-logo.png', import.meta.url).href;

type CockpitAppProps = {
  runtime: RuntimePort;
  targetTabId?: number | undefined;
  initialRunId?: string | undefined;
};

export function CockpitApp({ runtime, targetTabId, initialRunId }: CockpitAppProps) {
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<RunMode>('ask');
  const [busy, setBusy] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);
  const [approvalResult, setApprovalResult] = useState<RuntimeToolExecutionResult>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<'trace' | 'tools' | 'elements' | 'streaming'>('trace');
  const [conversationMessages, setConversationMessages] = useState<AgentMessage[]>([]);
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
  const structuredPageData = snapshot?.structuredPageData ?? emptyStructuredPageData();
  const runDisplayState = busy ? 'starting' : agentState.displayState;
  const waterfallSnapshot = snapshot
    ? {
        ...snapshot,
        messages: conversationMessages
      }
    : undefined;

  const applySnapshot = useCallback((
    nextSnapshot: RunSnapshot,
    options: { persistMessages?: boolean } = {}
  ) => {
    pageDataStore.getState().setSnapshot(nextSnapshot);
    traceStore.getState().setEvents(nextSnapshot.trace ?? []);
    if (options.persistMessages) {
      setConversationMessages((messages) =>
        mergeAgentMessages(messages, nextSnapshot.messages ?? [])
      );
    }
    if (nextSnapshot.pendingApproval) {
      approvalStore.getState().setPending(nextSnapshot.pendingApproval);
    } else {
      approvalStore.getState().clearPending();
    }
    agentStore.getState().setDisplayState(statusToDisplayState(nextSnapshot.status, false));
  }, [agentStore, approvalStore, pageDataStore, traceStore]);

  const subscribeToRun = useCallback((
    runId: string,
    options: { persistMessages?: boolean } = {}
  ) => {
    unsubscribeRunRef.current?.();
    unsubscribeRunRef.current = runtime.subscribeRun(runId, () => {
      void runtime.getRunSnapshot(runId).then((nextSnapshot) => {
        applySnapshot(nextSnapshot, options);
      });
    });
  }, [applySnapshot, runtime]);

  useEffect(() => {
    void settingsStore.getState().load();
  }, [settingsStore]);

  useEffect(() => {
    document.body.classList.add('animal-cursor--force');
    document.documentElement.classList.add('animal-cursor--force');
    return () => {
      document.body.classList.remove('animal-cursor--force');
      document.documentElement.classList.remove('animal-cursor--force');
    };
  }, []);

  useEffect(() => () => {
    unsubscribeRunRef.current?.();
  }, []);

  useEffect(() => {
    if (!initialRunId) {
      return;
    }
    let active = true;
    subscribeToRun(initialRunId, { persistMessages: true });
    void runtime.getRunSnapshot(initialRunId).then((nextSnapshot) => {
      if (!active) {
        return;
      }
      applySnapshot(nextSnapshot, { persistMessages: true });
      setMode(nextSnapshot.mode);
    });
    return () => {
      active = false;
    };
  }, [applySnapshot, runtime, initialRunId, subscribeToRun]);

  useEffect(() => {
    if (!targetTabId || initialRunId) {
      return undefined;
    }
    let active = true;
    const timers: number[] = [];
    const retryDelays = [500, 1_500, 3_000, 6_000];
    const observe = (attempt: number) => {
      void runtime
        .startRun({
          task: '观察当前页面',
          mode: 'ask',
          tabId: targetTabId,
          skipProviderResponse: true
        })
        .then((started) => {
          subscribeToRun(started.runId, { persistMessages: attempt === 0 });
          return runtime.getRunSnapshot(started.runId);
        })
        .then((nextSnapshot) => {
          if (!active) {
            return;
          }
          applySnapshot(nextSnapshot, { persistMessages: attempt === 0 });
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
  }, [applySnapshot, runtime, subscribeToRun, targetTabId, initialRunId]);

  const start = async () => {
    const submittedTask = task.trim();
    if (!submittedTask) {
      return;
    }
    setBusy(true);
    setApprovalResult(undefined);
    try {
      const started = await runtime.startRun({
        task: submittedTask,
        mode,
        tabId: targetTabId
      });
      setTask('');
      agentStore.getState().startRun({ runId: started.runId, mode });
      subscribeToRun(started.runId, { persistMessages: true });
      const nextSnapshot = await runtime.getRunSnapshot(started.runId);
      applySnapshot(nextSnapshot, { persistMessages: true });
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
    applySnapshot(await runtime.getRunSnapshot(snapshot.runId), { persistMessages: true });
  };

  const reviseCurrentGoal = async () => {
    const currentSnapshot = snapshot;
    const goal = task.trim();
    if (!currentSnapshot || !currentSnapshot.canReviseGoal || !goal) {
      return;
    }
    setReviseBusy(true);
    try {
      const nextSnapshot = await runtime.reviseGoal({
        runId: currentSnapshot.runId,
        goal
      });
      applySnapshot(nextSnapshot, { persistMessages: true });
      setMode(nextSnapshot.mode);
    } finally {
      setReviseBusy(false);
    }
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
    applySnapshot(await runtime.getRunSnapshot(currentSnapshot.runId), { persistMessages: true });
  };

  const saveSettings = async (nextSettings: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    streamingEnabled?: boolean;
  }) => {
    await settingsStore.getState().save(nextSettings);
  };

  const inspectElement = async (refId: string) => {
    const currentSnapshot = snapshot;
    if (!currentSnapshot || refId.startsWith('sensitive_ref_')) {
      return;
    }
    await runtime.highlightRef({
      runId: currentSnapshot.runId,
      refId
    });
  };

  return (
    <main className="bh-agentSidePanel animal-cursor--force">
      <header className="bh-agentHeader">
        <div className="bh-agentBrand">
          <img className="bh-brandMark" src={browserHelmLogoUrl} alt="" aria-hidden="true" />
          <div>
            <h1>BrowserHelm</h1>
            <p>agentic page inspector</p>
          </div>
        </div>
        <div className="bh-agentHeaderActions">
          <span className={`bh-agentStatus${!settingsState.settings ? ' bh-agentStatus--unconfigured' : ''}`}>{statusLabel(runDisplayState)}</span>
          <Button
            htmlType="button"
            className="bh-headerIconButton"
            aria-label="高级开发者选项"
            icon={<Bug size={18} />}
            onClick={() => {
              setDebugTab('trace');
              setDebugOpen(true);
            }}
          />
          <Button
            htmlType="button"
            className="bh-headerIconButton"
            aria-label="打开模型配置"
            icon={<Settings size={18} />}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      <AgentMessageList snapshot={waterfallSnapshot} />

      <div className="bh-agentComposerDock">
        {snapshot?.canReviseGoal ? (
          <div className="bh-reviseGoalBar">
            <span>当前 run 可修改目标</span>
            <Button
              htmlType="button"
              type="default"
              icon={<PencilLine size={14} />}
              disabled={reviseBusy || !task.trim()}
              onClick={() => {
                void reviseCurrentGoal();
              }}
            >
              修改目标
            </Button>
          </div>
        ) : null}
        <ChatPanel
          task={task}
          mode={mode}
          busy={busy}
          canStop={snapshot?.streaming?.active === true || runDisplayState === 'thinking'}
          onTaskChange={setTask}
          onModeChange={setMode}
          onStart={() => {
            void start();
          }}
          onStop={() => {
            void stop();
          }}
        />
      </div>

      {approvalState.pending || approvalResult ? (
        <section className="bh-agentApproval">
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
          {approvalResult ? (
            <p className="bh-approvalResult" role="status">
              审批结果：{approvalResult.code}
            </p>
          ) : null}
        </section>
      ) : null}

      {settingsOpen ? (
        <div className="bh-debugOverlay" onClick={() => setSettingsOpen(false)}>
          <div className="bh-debugDrawerPanel" onClick={(e) => e.stopPropagation()}>
            <div className="bh-debugDrawerHeader">
              <span className="bh-modalTitle"><Settings size={18} />模型配置</span>
              <button
                className="bh-debugDrawerClose"
                aria-label="关闭"
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="bh-debugDrawerBody">
              <ModelConfigForm
                key={[
                  settingsState.settings?.baseUrl,
                  settingsState.settings?.model,
                  settingsState.maskedApiKey,
                  String(settingsState.settings?.streamingEnabled ?? true)
                ].join('|')}
                settings={settingsState.settings}
                maskedApiKey={settingsState.maskedApiKey}
                onClose={() => setSettingsOpen(false)}
                onSave={saveSettings}
                onTest={(nextSettings) => runtime.testProviderSettings(nextSettings)}
              />
            </div>
          </div>
        </div>
      ) : null}
      {debugOpen ? (
        <div className="bh-debugOverlay" onClick={() => setDebugOpen(false)}>
          <div className="bh-debugDrawerPanel" onClick={(e) => e.stopPropagation()}>
            <div className="bh-debugDrawerHeader">
              <span className="bh-modalTitle"><Bug size={18} />高级开发者选项</span>
              <button
                className="bh-debugDrawerClose"
                aria-label="关闭"
                onClick={() => setDebugOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="bh-debugDrawerBody">
              <AdvancedDebugPanel
                snapshot={snapshot ? { ...snapshot, trace } : undefined}
                structuredPageData={structuredPageData}
                activeTab={debugTab}
                onTabChange={setDebugTab}
                onInspectElement={(refId) => {
                  void inspectElement(refId);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function mergeAgentMessages(
  existingMessages: AgentMessage[],
  nextMessages: AgentMessage[]
): AgentMessage[] {
  if (nextMessages.length === 0) {
    return existingMessages;
  }
  const messagesById = new Map(existingMessages.map((message) => [message.id, message]));
  const orderedIds = existingMessages.map((message) => message.id);
  for (const message of nextMessages) {
    if (!messagesById.has(message.id)) {
      orderedIds.push(message.id);
    }
    messagesById.set(message.id, message);
  }
  return orderedIds
    .map((id) => messagesById.get(id))
    .filter((message): message is AgentMessage => Boolean(message));
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

function statusLabel(status: RunDisplayState): string {
  const labels: Record<RunDisplayState, string> = {
    idle: 'Ready',
    starting: 'Starting',
    observing: 'Observing',
    thinking: 'Thinking',
    executing_tool: 'Running',
    waiting_for_approval: 'Approval',
    waiting_for_user: 'Waiting',
    recovering: 'Recovering',
    finished: 'Done',
    failed: 'Error',
    cancelled: 'Stopped'
  };
  return labels[status];
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
