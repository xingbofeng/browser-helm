import { useCallback, useEffect, useMemo, useState } from 'react';

import { ExtensionRuntimePort } from '../../runtime/extension-runtime-port';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import { SIDE_PANEL_MESSAGES } from '../../shared/constants/event-names';
import type { StructuredPageData } from '../../shared/schemas/structured-page-data.schema';
import type { RunMode } from '../../shared/schemas/tool.schema';
import './app.css';

type SidePanelViewProps = {
  task: string;
  mode: RunMode;
  initialTab?: SidePanelTab;
  snapshot: RunSnapshot | undefined;
  busy?: boolean;
  error?: string | undefined;
  onTaskChange: (task: string) => void;
  onModeChange: (mode: RunMode) => void;
  onStartRun: () => void;
};

type SidePanelTab = 'observation' | 'refs' | 'interactive' | 'forms';

const INITIAL_OBSERVE_DELAYS_MS = [0, 500, 1_500, 3_000, 6_000] as const;
const NAVIGATION_SETTLE_DELAYS_MS = [250, 1_000, 2_500, 5_000] as const;

export function App() {
  const port = useMemo<RuntimePort>(() => new ExtensionRuntimePort(), []);
  const [task, setTask] = useState('观察当前页面');
  const [mode, setMode] = useState<RunMode>('ask');
  const [snapshot, setSnapshot] = useState<RunSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const runWithTask = useCallback(async (taskToRun: string, modeToRun: RunMode) => {
    setBusy(true);
    setError(undefined);
    try {
      const tabId = await resolveTargetTabId();
      const started = await port.startRun({ task: taskToRun, mode: modeToRun, tabId });
      const nextSnapshot = await port.getRunSnapshot(started.runId);
      setSnapshot(nextSnapshot);
    } catch (runError) {
      setSnapshot(undefined);
      setError(runError instanceof Error ? runError.message : 'Runtime request failed');
    } finally {
      setBusy(false);
    }
  }, [port]);

  const startRun = useCallback(async () => {
    await runWithTask(task, mode);
  }, [runWithTask, task, mode]);

  useEffect(() => {
    const timers = scheduleSettledRefreshes(
      () => {
        void runWithTask('观察当前页面', mode);
      },
      INITIAL_OBSERVE_DELAYS_MS
    );
    return () => clearTimers(timers);
  }, [runWithTask, mode]);

  useEffect(() => {
    if (!globalThis.chrome?.tabs) {
      return undefined;
    }

    let debounceTimer: number | undefined;
    let settleTimers: number[] = [];
    const scheduleRefresh = () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        clearTimers(settleTimers);
        settleTimers = scheduleSettledRefreshes(
          () => {
            void runWithTask('观察当前页面', mode);
          },
          NAVIGATION_SETTLE_DELAYS_MS
        );
      }, 250);
    };
    const scheduleRefreshForTab = (tabId: number) => {
      if (isPinnedTarget() && readTabIdFromUrl() !== tabId) {
        return;
      }
      if (isActiveTarget()) {
        writeTabIdToUrl(tabId);
      }
      scheduleRefresh();
    };

    const onActivated = (activeInfo: { tabId: number }) => {
      if (isActiveTarget()) {
        writeTabIdToUrl(activeInfo.tabId);
        scheduleRefresh();
      }
    };
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      const shouldRefreshPinnedTab = isPinnedTarget() && readTabIdFromUrl() === tabId;
      const shouldRefreshActiveTab = isActiveTarget() && tab.active;
      const changedEnough = Boolean(changeInfo.url) || changeInfo.status === 'complete';

      if (changedEnough && (shouldRefreshPinnedTab || shouldRefreshActiveTab)) {
        if (shouldRefreshActiveTab) {
          writeTabIdToUrl(tabId);
        }
        scheduleRefresh();
      }
    };
    const onFrameNavigation = (details: { tabId: number }) => {
      scheduleRefreshForTab(details.tabId);
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.webNavigation?.onDOMContentLoaded?.addListener(onFrameNavigation);
    chrome.webNavigation?.onCompleted?.addListener(onFrameNavigation);
    const port = globalThis.chrome?.runtime?.connect?.({
      name: SIDE_PANEL_MESSAGES.TARGET_PORT
    });
    const onTargetMessage = (message: unknown) => {
      const tabId = readTargetTabChangedTabId(message);
      if (tabId && isActiveTarget()) {
        writeTabIdToUrl(tabId);
        scheduleRefresh();
      }
    };
    port?.onMessage.addListener(onTargetMessage);

    return () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      clearTimers(settleTimers);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.webNavigation?.onDOMContentLoaded?.removeListener(onFrameNavigation);
      chrome.webNavigation?.onCompleted?.removeListener(onFrameNavigation);
      port?.onMessage.removeListener(onTargetMessage);
      port?.disconnect();
    };
  }, [runWithTask, mode]);

  return (
    <SidePanelView
      task={task}
      mode={mode}
      snapshot={snapshot}
      busy={busy}
      error={error}
      onTaskChange={setTask}
      onModeChange={setMode}
      onStartRun={() => {
        void startRun();
      }}
    />
  );
}

function scheduleSettledRefreshes(
  refresh: () => void,
  delays: readonly number[]
): number[] {
  return delays.map((delay) => window.setTimeout(refresh, delay));
}

function clearTimers(timers: number[]): void {
  for (const timer of timers) {
    window.clearTimeout(timer);
  }
}

export function SidePanelView(props: SidePanelViewProps) {
  const {
    task,
    mode,
    initialTab,
    snapshot,
    busy,
    error,
    onTaskChange,
    onModeChange,
    onStartRun
  } = props;
  const [activeTab, setActiveTab] = useState<SidePanelTab>(
    initialTab ?? 'observation'
  );
  const observation = snapshot?.observation;
  const refs = snapshot?.refs ?? [];
  const structuredPageData = snapshot?.structuredPageData;
  const isError = Boolean(error) || snapshot?.status === 'error';
  const isEmpty = snapshot?.status === 'empty';
  const statusText = statusLabel(snapshot, busy, error);

  return (
    <main className="bh-shell">
      <header className="bh-header">
        <div className="bh-brandMark" aria-hidden="true">BH</div>
        <div>
          <h1>BrowserHelm <span>v0.2</span></h1>
          <p>浏览器页面观察原型</p>
        </div>
        <div className={`bh-status ${isError ? 'error' : ''}`}>{statusText}</div>
      </header>

      <section className="bh-taskRow" aria-label="任务输入">
        <div className="bh-modeGroup" aria-label="Run Mode">
          <label htmlFor="bh-run-mode">当前模式</label>
          <div className="bh-modeSelectWrap">
            <select
              id="bh-run-mode"
              aria-label="选择 Run Mode"
              value={mode}
              onChange={(event) => onModeChange(event.currentTarget.value as RunMode)}
            >
              <option value="ask">Ask</option>
              <option value="debug">Debug</option>
              <option value="form">Form</option>
            </select>
          </div>
        </div>
        <input
          aria-label="任务"
          value={task}
          onChange={(event) => onTaskChange(event.currentTarget.value)}
          placeholder="请输入任务，例如：帮我分析这个表单为什么不能提交"
        />
        <button type="button" aria-label="发送任务" onClick={onStartRun} disabled={busy}>
          {busy ? '...' : 'Go'}
        </button>
      </section>

      <nav className="bh-tabs" aria-label="观察视图">
        <button
          type="button"
          className={activeTab === 'observation' ? 'active' : ''}
          aria-pressed={activeTab === 'observation'}
          onClick={() => setActiveTab('observation')}
        >
          页面观察
        </button>
        <button
          type="button"
          className={activeTab === 'refs' ? 'active' : ''}
          aria-pressed={activeTab === 'refs'}
          onClick={() => setActiveTab('refs')}
        >
          Ref 映射
        </button>
        <button
          type="button"
          className={activeTab === 'interactive' ? 'active' : ''}
          aria-pressed={activeTab === 'interactive'}
          onClick={() => setActiveTab('interactive')}
        >
          交互元素
        </button>
        <button
          type="button"
          className={activeTab === 'forms' ? 'active' : ''}
          aria-pressed={activeTab === 'forms'}
          onClick={() => setActiveTab('forms')}
        >
          表单字段
        </button>
      </nav>

      {structuredPageData ? (
        <section className="bh-structuredSummary" aria-label="Structured Page Data">
          <h2>Structured Page Data</h2>
          <div>
            <span>observation <strong>{structuredPageData.observation.status}</strong></span>
            <span>refs <strong>{structuredPageData.refs.status}</strong> {structuredPageData.refs.count}</span>
            <span>interactive <strong>{structuredPageData.interactive.status}</strong> {structuredPageData.interactive.count}</span>
            <span>forms <strong>{structuredPageData.forms.status}</strong> {structuredPageData.forms.count}</span>
          </div>
        </section>
      ) : null}

      {activeTab === 'observation' ? (
        <section className="bh-grid" aria-label="页面观察">
          <article className="bh-card">
            <h2>页面摘要</h2>
            <p>{observation?.pageStateSummary ?? '等待页面观察结果。'}</p>
          </article>
          <article className="bh-card">
            <h2>当前 URL / 标题</h2>
            <dl>
              <dt>URL</dt>
              <dd>{observation?.url ?? '未观察'}</dd>
              <dt>标题</dt>
              <dd>{observation?.title ?? '未观察'}</dd>
              <dt>Origin</dt>
              <dd>{observation?.origin ?? '未观察'}</dd>
            </dl>
          </article>
          <article className="bh-card wide">
            <h2>可见文本摘要</h2>
            <p>{observation?.visibleTextSummary || '暂无可见文本摘要。'}</p>
          </article>
          <article className="bh-card">
            <h2>页面状态</h2>
            <p className={`bh-state ${isError ? 'error' : 'ok'}`}>{statusText}</p>
            <p className="bh-state warn">
              交互元素 {observation?.interactiveCount ?? refs.length}
            </p>
            <p className="bh-state warn">Domain {observation?.currentDomain ?? 'unknown'}</p>
          </article>
        </section>
      ) : null}

      {activeTab === 'refs' ? (
        <section className="bh-refPanel" aria-label="Ref 映射">
          <header>
            <div>
              <h2>Ref 映射列表</h2>
              <p>当前 observation 返回的元素 Ref 映射关系，包含元素类型、标签、状态与可见性。</p>
            </div>
            <button type="button" onClick={onStartRun} disabled={busy}>刷新</button>
          </header>
          <div className="bh-statRow">
            <span>全部 Ref <strong>{refs.length}</strong></span>
            <span>表单控件 <strong>{countRoles(refs, ['textbox', 'checkbox', 'combobox'])}</strong></span>
            <span>按钮/操作 <strong>{countRoles(refs, ['button'])}</strong></span>
            <span>链接/文本 <strong>{countRoles(refs, ['link'])}</strong></span>
          </div>
          {refs.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>ref_id</th>
                  <th>类型</th>
                  <th>名称 / 描述</th>
                  <th>标签</th>
                  <th>状态</th>
                  <th>可见性</th>
                </tr>
              </thead>
              <tbody>
                {refs.map((ref) => (
                  <tr key={ref.refId}>
                    <td>{ref.refId}</td>
                    <td>{ref.role ?? 'unknown'}</td>
                    <td>{ref.name || '(no name)'}</td>
                    <td>{ref.tagName}</td>
                    <td>{ref.disabled ? '禁用' : '可用'}</td>
                    <td>{ref.visible ? '可见' : '不可见'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="bh-empty">当前 observation 没有返回 ref 映射。</p>
          )}
        </section>
      ) : null}

      {activeTab === 'interactive' ? (
        <InteractivePanel data={structuredPageData?.interactive} />
      ) : null}

      {activeTab === 'forms' ? (
        <FormsPanel data={structuredPageData?.forms} />
      ) : null}

      <section className="bh-result">
        <h2>工具结果 <span>最新</span></h2>
        {snapshot?.toolResult ? (
          <div className={snapshot.toolResult.ok ? 'bh-success' : 'bh-error'}>
            {snapshot.toolResult.tool} {snapshot.toolResult.code}: {snapshot.toolResult.summary}
          </div>
        ) : (
          <div className="bh-empty">暂无工具结果。</div>
        )}
      </section>
      <section className="bh-stateGrid" aria-label="空状态和错误状态">
        <article className="bh-miniState">
          <h2>Empty 状态</h2>
          <p>
            {isEmpty
              ? observation?.pageStateSummary
              : '当页面没有识别到可交互元素时，将展示 empty reason 和重新观察提示。'}
          </p>
        </article>
        <article className="bh-miniState">
          <h2>Error 状态</h2>
          <p>{error ?? snapshot?.error?.code ?? '暂无错误。'}</p>
          {snapshot?.error?.message ? <p>{snapshot.error.message}</p> : null}
        </article>
      </section>
      <section className="bh-result compact">
        <h2>
          Trace / 调试日志 <span>{snapshot?.runId ?? '未开始'}</span>
        </h2>
        <p className="bh-modeTrace">当前模式 {snapshot?.mode ?? mode}</p>
      </section>
    </main>
  );
}

function InteractivePanel(props: {
  data: StructuredPageData['interactive'] | undefined;
}) {
  const data = props.data;
  const first = data?.items[0];
  return (
    <section className="bh-refPanel" aria-label="交互元素">
      <header>
        <div>
          <h2>交互元素</h2>
          <p>{data?.summary ?? '等待 v0.31 交互元素数据。'}</p>
        </div>
      </header>
      <div className="bh-statRow">
        <span>交互元素数量 <strong>{data?.count ?? 0}</strong></span>
        <span>可用 <strong>{data?.items.filter((item) => !item.disabled).length ?? 0}</strong></span>
        <span>禁用 <strong>{data?.items.filter((item) => item.disabled).length ?? 0}</strong></span>
        <span>状态 <strong>{data?.status ?? 'pending'}</strong></span>
      </div>
      {data?.status === 'empty' ? (
        <p className="bh-empty">{data.emptyReason ?? '未检测到交互元素。'}</p>
      ) : null}
      {data?.items.length ? (
        <>
          <table>
            <thead>
              <tr>
                <th>ref_id</th>
                <th>role</th>
                <th>name</th>
                <th>状态</th>
                <th>选择态</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.refId}>
                  <td>{item.refId}</td>
                  <td>{item.role ?? 'unknown'}</td>
                  <td>{item.name ?? '(no name)'}</td>
                  <td>{item.visible ? '可见' : '不可见'} / {item.disabled ? '禁用' : '可用'}</td>
                  <td>{formatInteractiveState(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {first ? (
            <article className="bh-detailCard">
              <h3>基础详情</h3>
              <p>{first.refId} · {first.role ?? 'unknown'} · {first.tagName}</p>
              <p>{first.name ?? '(no name)'}</p>
            </article>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function FormsPanel(props: {
  data: StructuredPageData['forms'] | undefined;
}) {
  const data = props.data;
  const requiredCount = data?.items.filter((field) => field.required).length ?? 0;
  const invalidCount =
    data?.items.filter((field) => !field.validation.valid).length ?? 0;
  const submit = data?.items.find((field) => field.submit)?.submit;
  return (
    <section className="bh-refPanel" aria-label="表单字段">
      <header>
        <div>
          <h2>表单字段</h2>
          <p>{data?.summary ?? '等待 v0.32 表单字段数据。'}</p>
        </div>
      </header>
      <div className="bh-statRow">
        <span>字段数量 <strong>{data?.count ?? 0}</strong></span>
        <span>必填 <strong>{requiredCount}</strong></span>
        <span>校验错误 <strong>{invalidCount}</strong></span>
        <span>{submit?.disabled ? 'submit disabled' : 'submit enabled'}</span>
      </div>
      {submit?.reason ? (
        <article className="bh-detailCard">
          <h3>Disabled Submit Reason</h3>
          <p>{confidenceLabel(submit.reason.kind)}：{submit.reason.message}</p>
        </article>
      ) : null}
      {data?.status === 'empty' ? (
        <p className="bh-empty">{data.emptyReason ?? '当前页面未检测到表单字段。'}</p>
      ) : null}
      {data?.items.length ? (
        <table>
          <thead>
            <tr>
              <th>ref_id</th>
              <th>label</th>
              <th>type</th>
              <th>required</th>
              <th>valuePreview</th>
              <th>validation</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((field) => (
              <tr key={field.refId}>
                <td>{field.refId}</td>
                <td>{field.label ?? field.name ?? '(no label)'}</td>
                <td>{field.type}</td>
                <td>{field.required ? '必填' : '可选'}</td>
                <td>{field.valuePreview}</td>
                <td>{field.validation.valid ? 'valid' : field.validation.message ?? 'invalid'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

function formatInteractiveState(item: {
  checked?: boolean | undefined;
  selected?: boolean | undefined;
}): string {
  const parts = [];
  if (item.checked !== undefined) {
    parts.push(`checked=${String(item.checked)}`);
  }
  if (item.selected !== undefined) {
    parts.push(`selected=${String(item.selected)}`);
  }
  return parts.join(' / ') || '-';
}

function confidenceLabel(kind: 'confirmed' | 'inferred' | 'unknown'): string {
  if (kind === 'confirmed') {
    return '已确认';
  }
  if (kind === 'inferred') {
    return '推断';
  }
  return '无法判断';
}

function statusLabel(
  snapshot: RunSnapshot | undefined,
  busy: boolean | undefined,
  error: string | undefined
): string {
  if (busy) {
    return '观察中';
  }
  if (error) {
    return 'Runtime 错误';
  }
  if (!snapshot) {
    return '等待观察';
  }
  if (snapshot.status === 'observed') {
    return '已连接当前页面';
  }
  if (snapshot.status === 'empty') {
    return '页面为空';
  }
  if (snapshot.status === 'error') {
    return '观察失败';
  }
  return snapshot.status;
}

function countRoles(refs: NonNullable<RunSnapshot['refs']>, roles: string[]): number {
  return refs.filter((ref) => ref.role && roles.includes(ref.role)).length;
}

function readTabIdFromUrl(): number | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const rawTabId = new URLSearchParams(window.location.search).get('tabId');
  if (!rawTabId) {
    return undefined;
  }
  const parsed = Number(rawTabId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readTargetModeFromUrl(): 'active' | 'pinned' {
  if (typeof window === 'undefined') {
    return 'active';
  }
  return resolveTargetModeFromSearch(window.location.search);
}

export function resolveTargetModeFromSearch(search: string): 'active' | 'pinned' {
  const params = new URLSearchParams(search);
  if (params.get('target') === 'active') {
    return 'active';
  }
  return params.has('tabId') ? 'pinned' : 'active';
}

export function readTargetTabChangedTabId(message: unknown): number | undefined {
  if (typeof message !== 'object' || message === null) {
    return undefined;
  }
  const record = message as Record<string, unknown>;
  return record.type === SIDE_PANEL_MESSAGES.TARGET_TAB_CHANGED &&
    Number.isInteger(record.tabId) &&
    Number(record.tabId) > 0
    ? Number(record.tabId)
    : undefined;
}

function isActiveTarget(): boolean {
  return readTargetModeFromUrl() === 'active';
}

function isPinnedTarget(): boolean {
  return readTargetModeFromUrl() === 'pinned' && Boolean(readTabIdFromUrl());
}

function writeTabIdToUrl(tabId: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  const url = new URL(window.location.href);
  if (url.searchParams.get('tabId') === String(tabId)) {
    return;
  }
  url.searchParams.set('tabId', String(tabId));
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

async function resolveTargetTabId(): Promise<number | undefined> {
  const pinnedTabId = readTabIdFromUrl();
  if (readTargetModeFromUrl() === 'pinned' && pinnedTabId) {
    return pinnedTabId;
  }

  if (!globalThis.chrome?.tabs?.query) {
    return undefined;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  return tab?.id;
}
