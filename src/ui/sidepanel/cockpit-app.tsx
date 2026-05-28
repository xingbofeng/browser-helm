import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Bug, PencilLine, Settings } from 'lucide-react';
import { Button } from 'animal-island-ui';

import type { RuntimeToolExecutionResult, RunSnapshot } from '../../runtime/runtime-messages';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { AgentMessage } from '../../shared/schemas/agent-message.schema';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { useT } from '../../i18n/context';
import { useLocale } from '../../i18n/context';
import { readLocale, writeLocale } from '../../i18n/locale';
import { createAppSettingsStore } from '../stores/app-settings-store';
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
  const t = useT();
  const locale = useLocale();
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
  const foregroundUserRunIdRef = useRef<string | undefined>(initialRunId);
  const userRunPendingRef = useRef(false);
  const agentStore = useMemo(() => createAgentStore(), []);
  const traceStore = useMemo(() => createTraceStore(locale), [locale]);
  const pageDataStore = useMemo(() => createPageDataStore(), []);
  const approvalStore = useMemo(() => createApprovalStore(), []);
  const settingsStore = useMemo(() => createSettingsStore(runtime, locale), [runtime, locale]);
  const appSettingsStore = useMemo(
    () => createAppSettingsStore({ readLocale, writeLocale }),
    []
  );
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
    void appSettingsStore.getState().loadLocale();
  }, [appSettingsStore]);

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
    foregroundUserRunIdRef.current = initialRunId;
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
    foregroundUserRunIdRef.current = undefined;
    userRunPendingRef.current = false;
    let active = true;
    const timers: number[] = [];
    const retryDelays = [500, 1_500, 3_000, 6_000];
    const observe = (attempt: number) => {
      if (foregroundUserRunIdRef.current || userRunPendingRef.current) {
        return;
      }
      void runtime
        .startRun({
          task: t('cockpit.autoObserveTask'),
          mode: 'ask',
          tabId: targetTabId,
          runKind: 'observe_only'
        })
        .then((started) => {
          if (foregroundUserRunIdRef.current || userRunPendingRef.current) {
            return undefined;
          }
          subscribeToRun(started.runId, { persistMessages: attempt === 0 });
          return runtime.getRunSnapshot(started.runId);
        })
        .then((nextSnapshot) => {
          if (!active || !nextSnapshot || foregroundUserRunIdRef.current || userRunPendingRef.current) {
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
  }, [applySnapshot, runtime, subscribeToRun, targetTabId, targetRevision, initialRunId, t]);

  const start = async () => {
    const submittedTask = task.trim();
    if (!submittedTask) {
      return;
    }
    setBusy(true);
    setApprovalResult(undefined);
    userRunPendingRef.current = true;
    try {
      const started = await runtime.startRun({
        task: submittedTask,
        mode,
        tabId: targetTabId
      });
      foregroundUserRunIdRef.current = started.runId;
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
          t('error.sendFailed'),
          error instanceof Error ? error.message : t('error.cantStart')
        )
      ]);
      foregroundUserRunIdRef.current = undefined;
    } finally {
      userRunPendingRef.current = false;
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
      ...(decision === 'denied' ? { reason: t('cockpit.approvalDenyReason') } : {})
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
      throw new Error(t('runtime.error.noModifiableApproval'));
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
            <h1>{t('brand.name')}</h1>
            <p>{t('brand.tagline')}</p>
          </div>
        </div>
        <div className="bh-agentHeaderActions">
          <span className={`bh-agentStatus${!settingsState.settings ? ' bh-agentStatus--unconfigured' : ''}`}>
            {statusLabel(runDisplayState, t)}
          </span>
          <Button
            htmlType="button"
            className="bh-headerIconButton"
            aria-label={t('header.debugAria')}
            icon={<Bug size={18} />}
            onClick={() => {
              setDebugTab('trace');
              setDebugOpen(true);
            }}
          />
          <Button
            htmlType="button"
            className="bh-headerIconButton"
            aria-label={t('header.settingsAria')}
            icon={<Settings size={18} />}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </header>

      <AgentMessageList snapshot={waterfallSnapshot} />

      <div className="bh-agentComposerDock">
        {showReviseGoal ? (
          <div className="bh-reviseGoalBar">
            <span>{t('reviseGoal.hint')}</span>
            <Button
              htmlType="button"
              type="default"
              icon={<PencilLine size={14} />}
              disabled={reviseBusy || !task.trim()}
              onClick={() => {
                void reviseCurrentGoal();
              }}
            >
              {t('reviseGoal.button')}
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
              {t('approval.resultPrefix')}{approvalResult.code}
            </p>
          ) : null}
        </section>
      ) : null}

      {settingsOpen ? (
        <div className="bh-debugOverlay" onClick={() => setSettingsOpen(false)}>
          <div className="bh-debugDrawerPanel" onClick={(e) => e.stopPropagation()}>
            <div className="bh-debugDrawerHeader">
              <span className="bh-modalTitle"><Settings size={18} />{t('settings.title')}</span>
              <button
                className="bh-debugDrawerClose"
                aria-label={t('settings.closeAria')}
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
              <span className="bh-modalTitle"><Bug size={18} />{t('debug.title')}</span>
              <button
                className="bh-debugDrawerClose"
                aria-label={t('debug.closeAria')}
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

function statusLabel(
  status: RunDisplayState,
  t: ReturnType<typeof useT>
): string {
  const labels: Record<RunDisplayState, string> = {
    idle: t('status.ready'),
    starting: t('status.starting'),
    observing: t('status.observing'),
    thinking: t('status.thinking'),
    executing_tool: t('status.running'),
    waiting_for_approval: t('status.approval'),
    waiting_for_user: t('status.waiting'),
    recovering: t('status.recovering'),
    finished: t('status.done'),
    failed: t('status.error'),
    cancelled: t('status.stopped')
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
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    refs: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    interactive: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    },
    forms: {
      items: [],
      warnings: [],
      count: 0,
      status: 'empty',
      updatedAt,
      summary: ''
    }
  };
}

type SubmitApprovalArgsPreview = {
  formName: string;
  fieldCount: number;
  filledCount: number;
  skippedCount: number;
  fields: SubmitApprovalFieldPreview[];
  verifyStatus: string;
  submitMethod: string;
  riskExplanation?: string;
  warnings: string[];
  submitTargetRefId?: string;
  highRisk: boolean;
};

type SubmitApprovalFieldPreview = {
  label: string;
  name?: string;
  valuePreview: string;
  fieldRefId: string;
  isSensitive: boolean;
  skipped: boolean;
};

function readSubmitApprovalArgs(value: unknown): SubmitApprovalArgsPreview | undefined {
  if (!isRecord(value)) return undefined;
  const fields = readSubmitApprovalField(value.fields);
  if (!fields.length) return undefined;
  const riskExplanation = readString(value.riskExplanation);
  const submitTargetRefId = readString(value.submitTargetRefId);
  return {
    formName: readString(value.formName) ?? 'Unknown form',
    fieldCount: readNumber(value.fieldCount),
    filledCount: readNumber(value.filledCount),
    skippedCount: readNumber(value.skippedCount),
    fields,
    verifyStatus: readString(value.verifyStatus) ?? 'unknown',
    submitMethod: readSubmitMethod(value.submitMethod) ?? 'unknown',
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((w): w is string => typeof w === 'string')
      : [],
    highRisk: Boolean(value.highRisk),
    ...(riskExplanation ? { riskExplanation } : {}),
    ...(submitTargetRefId ? { submitTargetRefId } : {})
  };
}

function readSubmitApprovalField(value: unknown): SubmitApprovalFieldPreview[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => {
      const name = readString(item.name);
      return {
        label: readString(item.label) ?? 'Unknown field',
        valuePreview: readString(item.valuePreview) ?? '',
        fieldRefId: readString(item.fieldRefId) ?? '',
        isSensitive: Boolean(item.isSensitive),
        skipped: Boolean(item.skipped),
        ...(name ? { name } : {})
      };
    });
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
