import { Play, Square } from 'lucide-react';

import { runModeLabels, type RunMode } from '../../shared/schemas/tool.schema';

type ChatPanelProps = {
  task: string;
  mode: RunMode;
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
      <label>
        <span>任务</span>
        <input
          aria-label="任务"
          value={props.task}
          onChange={(event) => props.onTaskChange(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>Run Mode</span>
        <select
          aria-label="选择 Run Mode"
          value={props.mode}
          onChange={(event) => props.onModeChange(event.currentTarget.value as RunMode)}
        >
          <option value="ask">{runModeLabels.ask}</option>
          <option value="debug">{runModeLabels.debug}</option>
          <option value="form">{runModeLabels.form}</option>
          <option value="act">{runModeLabels.act}</option>
        </select>
      </label>
      <div className="bh-runControls">
        <button type="button" aria-label="启动任务" disabled={props.busy} onClick={props.onStart}>
          <Play aria-hidden="true" size={16} />
          Start
        </button>
        <button type="button" aria-label="停止任务" disabled={!props.canStop} onClick={props.onStop}>
          <Square aria-hidden="true" size={16} />
          Stop
        </button>
      </div>
    </form>
  );
}
