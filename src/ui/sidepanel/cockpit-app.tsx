import { useEffect, useMemo, useState } from 'react';

import type { RuntimeToolExecutionResult, RunSnapshot } from '../../runtime/runtime-messages';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import { ApprovalDrawer } from '../approval/approval-drawer';
import { ChatPanel } from '../components/chat-panel';
import { CockpitShell } from '../components/cockpit-shell';
import { FormFieldsTab } from '../components/form-fields-tab';
import { InteractiveElementsTab } from '../components/interactive-elements-tab';
import { PageObservationTab } from '../components/page-observation-tab';
import { RefMapTab } from '../components/ref-map-tab';
import { RunStateBadge } from '../components/run-state-badge';
import { SettingsPanel } from '../components/settings-panel';
import { StepTimeline } from '../components/step-timeline';
import { ToolInspector } from '../components/tool-inspector';
import { TraceLog } from '../components/trace-log';
import { toTimelineItems } from '../lib/timeline-groups';
import type { RunDisplayState } from '../stores/agent-store';

type CockpitAppProps = {
  runtime: RuntimePort;
  targetTabId?: number | undefined;
};

type CockpitTab = 'observation' | 'refs' | 'interactive' | 'forms';

export function CockpitApp({ runtime, targetTabId }: CockpitAppProps) {
  const [task, setTask] = useState('观察当前页面');
  const [mode, setMode] = useState<RunMode>('ask');
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<RunSnapshot>();
  const [approvalResult, setApprovalResult] = useState<RuntimeToolExecutionResult>();
  const [activeTab, setActiveTab] = useState<CockpitTab>('observation');
  const [settings, setSettings] = useState({
    baseUrl: '',
    model: '',
    maskedApiKey: ''
  });
  const trace = useMemo(() => snapshot?.trace ?? [], [snapshot?.trace]);
  const timelineItems = useMemo(() => toTimelineItems(trace), [trace]);
  const structuredPageData = snapshot?.structuredPageData ?? emptyStructuredPageData();

  useEffect(() => {
    void runtime.getProviderSettings().then((providerSettings) => {
      if (!providerSettings) {
        return;
      }
      setSettings({
        baseUrl: providerSettings.baseUrl,
        model: providerSettings.model,
        maskedApiKey: providerSettings.apiKey ? '••••' : ''
      });
    });
  }, [runtime]);

  useEffect(() => {
    if (!targetTabId) {
      return undefined;
    }
    let active = true;
    setBusy(true);
    void runtime
      .startRun({ task: '观察当前页面', mode: 'ask', tabId: targetTabId })
      .then((started) => runtime.getRunSnapshot(started.runId))
      .then((nextSnapshot) => {
        if (!active) {
          return;
        }
        setSnapshot(nextSnapshot);
        setMode(nextSnapshot.mode);
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [runtime, targetTabId]);

  const start = async () => {
    setBusy(true);
    setApprovalResult(undefined);
    try {
      const started = await runtime.startRun({ task, mode });
      const nextSnapshot = await runtime.getRunSnapshot(started.runId);
      setSnapshot(nextSnapshot);
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
    setSnapshot(await runtime.getRunSnapshot(snapshot.runId));
  };

  const decide = async (decision: 'approved' | 'denied') => {
    const currentSnapshot = snapshot;
    const pendingApproval = currentSnapshot?.pendingApproval;
    if (!currentSnapshot || !pendingApproval) {
      return;
    }
    const result = await runtime.decideApproval({
      runId: currentSnapshot.runId,
      requestId: pendingApproval.id,
      decision,
      ...(decision === 'denied' ? { reason: '用户拒绝' } : {})
    });
    setApprovalResult(result);
    setSnapshot(await runtime.getRunSnapshot(currentSnapshot.runId));
  };

  return (
    <CockpitShell
      header={
        <div>
          <h1>BrowserHelm Cockpit</h1>
          <RunStateBadge state={statusToDisplayState(snapshot?.status, busy)} />
        </div>
      }
      task={
        <ChatPanel
          task={task}
          mode={mode}
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
            <button type="button" onClick={() => setActiveTab('observation')}>
              页面观察
            </button>
            <button type="button" onClick={() => setActiveTab('refs')}>
              Ref 映射
            </button>
            <button type="button" onClick={() => setActiveTab('interactive')}>
              交互元素
            </button>
            <button type="button" onClick={() => setActiveTab('forms')}>
              表单字段
            </button>
          </nav>
          <div data-active-tab={activeTab}>
            <PageObservationTab data={structuredPageData.observation} />
            <RefMapTab data={structuredPageData.refs} />
            <InteractiveElementsTab data={structuredPageData.interactive} />
            <FormFieldsTab data={structuredPageData.forms} />
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
        <ToolInspector
          toolResult={snapshot?.toolResult}
          argsPreview={snapshot?.pendingApproval?.argsPreview}
        />
      }
      approval={
        <>
          <ApprovalDrawer
            request={snapshot?.pendingApproval}
            decision={undefined}
            decisionError={approvalResult?.ok === false ? approvalResult.code : undefined}
            onApprove={() => {
              void decide('approved');
            }}
            onDeny={() => {
              void decide('denied');
            }}
          />
          {approvalResult ? <p>{approvalResult.code}</p> : null}
        </>
      }
      settings={
        <SettingsPanel
          baseUrl={settings.baseUrl}
          model={settings.model}
          maskedApiKey={settings.maskedApiKey}
          policyPlaceholders={[
            { id: 'read_only_default', label: '默认只读', status: 'reserved' },
            { id: 'confirm_before_submit', label: '提交前确认', status: 'reserved' },
            { id: 'domain_blocklist', label: 'Domain 禁用', status: 'reserved' },
            { id: 'debug_network_read', label: 'Debug/Network 读取', status: 'reserved' }
          ]}
          onSave={() => undefined}
        />
      }
    />
  );
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
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  if (status === 'cancelled') {
    return 'cancelled';
  }
  if (status === 'observed' || status === 'empty') {
    return 'observing';
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
