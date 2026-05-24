import { useCallback, useEffect, useMemo, useState } from 'react';

import { ExtensionRuntimePort } from '../../runtime/extension-runtime-port';
import type { RuntimePort } from '../../runtime/runtime-port';
import type { RunSnapshot } from '../../runtime/runtime-messages';
import './app.css';

type SidePanelViewProps = {
  task: string;
  snapshot: RunSnapshot | undefined;
  busy?: boolean;
  error?: string | undefined;
  onTaskChange: (task: string) => void;
  onStartRun: () => void;
};

type SidePanelTab = 'observation' | 'refs' | 'interactive' | 'forms';

export function App() {
  const port = useMemo<RuntimePort>(() => new ExtensionRuntimePort(), []);
  const [task, setTask] = useState('观察当前页面');
  const [snapshot, setSnapshot] = useState<RunSnapshot>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const runWithTask = useCallback(async (taskToRun: string) => {
    setBusy(true);
    setError(undefined);
    try {
      const tabId = await resolveTargetTabId();
      const started = await port.startRun({ task: taskToRun, tabId });
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
    await runWithTask(task);
  }, [runWithTask, task]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runWithTask('观察当前页面');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [runWithTask]);

  useEffect(() => {
    if (!globalThis.chrome?.tabs) {
      return undefined;
    }

    let timer: number | undefined;
    const scheduleRefresh = () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        void runWithTask('观察当前页面');
      }, 250);
    };

    const onActivated = () => {
      if (!hasPinnedTabId()) {
        scheduleRefresh();
      }
    };
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      const pinnedTabId = readTabIdFromUrl();
      const shouldRefreshPinnedTab = pinnedTabId === tabId;
      const shouldRefreshActiveTab = !pinnedTabId && tab.active;
      const changedEnough = Boolean(changeInfo.url) || changeInfo.status === 'complete';

      if (changedEnough && (shouldRefreshPinnedTab || shouldRefreshActiveTab)) {
        scheduleRefresh();
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [runWithTask]);

  return (
    <SidePanelView
      task={task}
      snapshot={snapshot}
      busy={busy}
      error={error}
      onTaskChange={setTask}
      onStartRun={() => {
        void startRun();
      }}
    />
  );
}

export function SidePanelView(props: SidePanelViewProps) {
  const { task, snapshot, busy, error, onTaskChange, onStartRun } = props;
  const [activeTab, setActiveTab] = useState<SidePanelTab>('observation');
  const observation = snapshot?.observation;
  const refs = snapshot?.refs ?? [];
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
        <TabPlaceholder
          title="交互元素"
          description="交互元素结构化列表将在 v0.31 接入。当前版本先通过 Ref 映射展示可交互元素基础信息。"
        />
      ) : null}

      {activeTab === 'forms' ? (
        <TabPlaceholder
          title="表单字段"
          description="表单字段结构化诊断将在 v0.32 接入。当前版本先展示页面观察和 Ref 映射。"
        />
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
        <h2>Trace / 调试日志 <span>{snapshot?.runId ?? '未开始'}</span></h2>
      </section>
    </main>
  );
}

function TabPlaceholder(props: { title: string; description: string }) {
  return (
    <section className="bh-placeholder" aria-label={props.title}>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </section>
  );
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

function hasPinnedTabId(): boolean {
  return Boolean(readTabIdFromUrl());
}

async function resolveTargetTabId(): Promise<number | undefined> {
  const pinnedTabId = readTabIdFromUrl();
  if (pinnedTabId) {
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
