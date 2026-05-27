import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Bug, PencilLine, Settings } from 'lucide-react';
import { Button } from 'animal-island-ui';

import type { RuntimeToolExecutionResult, RunSnapshot } from '../../runtime/runtime-messages';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
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
  targetRevision?: number | undefined;
  initialRunId?: string | undefined;
};

export function CockpitApp({
  runtime,
  targetTabId,
  targetRevision = 0,
  initialRunId
}: CockpitAppProps) {
  const [task, setTask] = useState('');
  const [mode, setMode] = useState<RunMode>('ask');
  const [busy, setBusy] = useState(false);
  const [reviseBusy, setReviseBusy] = useState(false);
  const [approvalResult, setApprovalResult] = useState<RuntimeToolExecutionResult>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTab, setDebugTab] = useState<'trace' | 'tools' | 'elements' | 'streaming' | 'form'>('trace');
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
  const showReviseGoal = Boolean(snapshot?.canReviseGoal && isRunActiveForGoalRevision(snapshot.status));

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
  }, [applySnapshot, runtime, subscribeToRun, targetTabId, targetRevision, initialRunId]);

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
    } catch (error) {
      setConversationMessages((messages) => [
        ...messages,
        localErrorMessage(
          `local-error:${Date.now()}`,
          '发送失败',
          error instanceof Error ? error.message : 'BrowserHelm 未能启动当前任务。'
        )
      ]);
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

  const updateApprovalField = async (input: {
    fieldRefId: string;
    value: string;
  }) => {
    const currentSnapshot = snapshot;
    const pendingApproval = currentSnapshot?.pendingApproval;
    const submitArgs = readSubmitApprovalArgs(pendingApproval?.argsPreview);
    if (!currentSnapshot || !submitArgs) {
      throw new Error('当前没有可修改的提交审批');
    }

    const fillResult = await runtime.executeTool({
      runId: currentSnapshot.runId,
      tool: TOOL_NAMES.FORM_FILL_FIELD,
      args: {
        fieldRefId: input.fieldRefId,
        value: input.value
      }
    });
    if (!fillResult.ok) {
      throw new Error(fillResult.error?.message ?? fillResult.summary);
    }

    const nextFields = submitArgs.fields.map((field) =>
      field.fieldRefId === input.fieldRefId
        ? { ...field, valuePreview: input.value }
        : field
    );
    const verifyResult = await runtime.executeTool({
      runId: currentSnapshot.runId,
      tool: TOOL_NAMES.FORM_VERIFY,
      args: {
        fieldRefIds: nextFields.map((field) => field.fieldRefId),
        ...(submitArgs.submitTargetRefId ? { submitRefId: submitArgs.submitTargetRefId } : {})
      }
    });
    const verifyData = isRecord(verifyResult.data) ? verifyResult.data : undefined;
    const verifyStatus = readString(verifyData?.status) ?? submitArgs.verifyStatus;

    await runtime.executeTool({
      runId: currentSnapshot.runId,
      tool: TOOL_NAMES.FORM_SUBMIT_WITH_APPROVAL,
      args: {
        ...submitArgs,
        fields: nextFields,
        verifyStatus,
        verifyFailed: verifyStatus === 'fail'
      }
    });
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
        {showReviseGoal ? (
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
            onFieldValueChange={updateApprovalField}
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

function isRunActiveForGoalRevision(status: RunSnapshot['status'] | undefined): boolean {
  return status === 'observing' ||
    status === 'thinking' ||
    status === 'executing_tool' ||
    status === 'waiting_for_user' ||
    status === 'recovering' ||
    status === 'waiting_for_approval';
}

function localErrorMessage(id: string, title: string, content: string): AgentMessage {
  const now = Date.now();
  return {
    id,
    role: 'agent',
    kind: 'error',
    status: 'error',
    title,
    content,
    createdAt: now,
    updatedAt: now
  };
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

type SubmitApprovalArgsPreview = {
  formRefId?: string | undefined;
  formName: string;
  submitMethod: 'button-click' | 'enter-submit';
  submitTargetRefId?: string | undefined;
  verifyStatus: 'pass' | 'fail' | 'warn';
  verifyFailed: boolean;
  fieldCount: number;
  filledCount: number;
  skippedCount: number;
  riskExplanation: string;
  fields: Array<{
    fieldRefId: string;
    label: string;
    name?: string | undefined;
    type: string;
    valuePreview: string;
    isSensitive: boolean;
    skipped?: boolean | undefined;
  }>;
  warnings: string[];
};

function readSubmitApprovalArgs(value: unknown): SubmitApprovalArgsPreview | undefined {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return undefined;
  }
  const formName = readString(value.formName);
  const submitMethod = readSubmitMethod(value.submitMethod);
  const verifyStatus = readVerifyStatus(value.verifyStatus);
  const riskExplanation = readString(value.riskExplanation);
  if (!formName || !submitMethod || !verifyStatus || !riskExplanation) {
    return undefined;
  }
  const fields = value.fields.flatMap(readSubmitApprovalField);
  if (fields.length === 0) {
    return undefined;
  }
  return {
    formRefId: readString(value.formRefId),
    formName,
    submitMethod,
    submitTargetRefId: readString(value.submitTargetRefId),
    verifyStatus,
    verifyFailed: value.verifyFailed === true,
    fieldCount: readNumber(value.fieldCount),
    filledCount: readNumber(value.filledCount),
    skippedCount: readNumber(value.skippedCount),
    riskExplanation,
    fields,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.flatMap((warning) => readString(warning) ?? [])
      : []
  };
}

function readSubmitApprovalField(value: unknown): SubmitApprovalArgsPreview['fields'] {
  if (!isRecord(value)) return [];
  const fieldRefId = readString(value.fieldRefId);
  const label = readString(value.label);
  const type = readString(value.type);
  const valuePreview = readString(value.valuePreview);
  if (!fieldRefId || !label || !type || !valuePreview) return [];
  return [{
    fieldRefId,
    label,
    name: readString(value.name),
    type,
    valuePreview,
    isSensitive: value.isSensitive === true,
    skipped: value.skipped === true
  }];
}

function readVerifyStatus(value: unknown): SubmitApprovalArgsPreview['verifyStatus'] | undefined {
  return value === 'pass' || value === 'fail' || value === 'warn' ? value : undefined;
}

function readSubmitMethod(value: unknown): SubmitApprovalArgsPreview['submitMethod'] | undefined {
  return value === 'button-click' || value === 'enter-submit' ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
