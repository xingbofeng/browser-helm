import { Play, Square } from 'lucide-react';

import { runModeLabels, type RunMode } from '../../shared/schemas/tool.schema';
import type { RunDisplayState } from '../stores/agent-store';
import { RunStateBadge } from './run-state-badge';

type ChatPanelProps = {
  task: string;
  mode: RunMode;
  runState: RunDisplayState;
  busy: boolean;
  canStop: boolean;
  onTaskChange: (task: string) => void;
  onModeChange: (mode: RunMode) => void;
  onStart: () => void;
  onStop: () => void;
};

export function ChatPanel(props: ChatPanelProps) {
  return (
    <form className="bh-chatPanel">
      <div className="bh-runQuickControls">
        <span className="bh-runLabel">运行状态</span>
        <RunStateBadge state={props.runState} />
        <button type="button" aria-label="启动任务" disabled={props.busy} onClick={props.onStart}>
          <Play aria-hidden="true" size={15} />
          运行
        </button>
        <button type="button" aria-label="停止任务" disabled={!props.canStop} onClick={props.onStop}>
          <Square aria-hidden="true" size={15} />
          停止
        </button>
      </div>
      <label>
        <span>当前任务</span>
        <input
          aria-label="任务"
          placeholder="请输入任务，例如：帮我分析这个表单为什么不能提交"
          value={props.task}
          onChange={(event) => props.onTaskChange(event.currentTarget.value)}
        />
      </label>
      <fieldset className="bh-modeSegment">
        <legend>Run Mode</legend>
        {(['ask', 'debug', 'form', 'act'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-label={`选择 ${runModeLabels[mode]}`}
            aria-pressed={props.mode === mode}
            onClick={() => props.onModeChange(mode)}
          >
            {runModeLabels[mode]}
          </button>
        ))}
      </fieldset>
    </form>
  );
}
