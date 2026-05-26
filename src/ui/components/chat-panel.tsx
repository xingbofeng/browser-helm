import { Check, ChevronDown, ChevronUp, Pause, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

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

const runModes = ['ask', 'debug', 'form', 'act'] as const;

export function ChatPanel(props: ChatPanelProps) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuId = useId();
  const modePickerRef = useRef<HTMLSpanElement>(null);
  const ModeChevron = modeMenuOpen ? ChevronUp : ChevronDown;

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!modePickerRef.current?.contains(event.target as Node)) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const chooseMode = (mode: RunMode) => {
    props.onModeChange(mode);
    setModeMenuOpen(false);
  };

  const handleModeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setModeMenuOpen(true);
    }
    if (event.key === 'Escape') {
      setModeMenuOpen(false);
    }
  };

  return (
    <form
      className="bh-chatPanel"
      onSubmit={(event) => {
        event.preventDefault();
        props.onStart();
      }}
    >
      <div className="bh-taskComposer">
        <div className="bh-taskInputRow">
          <span className="bh-modeSelectPill" ref={modePickerRef}>
            <button
              type="button"
              aria-label="选择 Run Mode"
              aria-haspopup="listbox"
              aria-expanded={modeMenuOpen}
              aria-controls={modeMenuId}
              onClick={() => setModeMenuOpen((open) => !open)}
              onKeyDown={handleModeKeyDown}
            >
              {runModeLabels[props.mode]}
            </button>
            <span className="bh-modeSelectArrow" data-open={modeMenuOpen} aria-hidden="true">
              <ModeChevron size={15} />
            </span>
            {modeMenuOpen ? (
              <ul className="bh-modeMenu" id={modeMenuId} role="listbox" aria-label="Run Mode">
                {runModes.map((mode) => (
                  <li key={mode} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={props.mode === mode}
                      className={props.mode === mode ? 'is-selected' : undefined}
                      onClick={() => chooseMode(mode)}
                    >
                      <span>{runModeLabels[mode]}</span>
                      {props.mode === mode ? <Check aria-hidden="true" size={16} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </span>
          <input
            aria-label="任务"
            placeholder="你想和 BrowserHelm 聊点什么......"
            value={props.task}
            onChange={(event) => props.onTaskChange(event.currentTarget.value)}
          />
          {props.canStop ? (
            <button
              type="button"
              aria-label="暂停回复"
              className="bh-pauseButton"
              onClick={props.onStop}
            >
              <Pause aria-hidden="true" size={18} />
            </button>
          ) : (
            <button type="submit" aria-label="启动任务" className="bh-sendButton" disabled={props.busy}>
              <Send aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
