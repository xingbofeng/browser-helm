import { Check, ChevronDown, ChevronUp, Pause, Send } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import { type RunMode } from '../../shared/schemas/tool.schema';
import { useT } from '../../i18n/context';

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

const primaryRunModes = ['ask', 'act'] as const;

export function ChatPanel(props: ChatPanelProps) {
  const t = useT();
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeMenuId = useId();
  const modePickerRef = useRef<HTMLSpanElement>(null);
  const ModeChevron = modeMenuOpen ? ChevronUp : ChevronDown;

  const modeLabel = (mode: RunMode): string => {
    switch (mode) {
      case 'ask': return t('chat.mode.ask');
      case 'act': return t('chat.mode.act');
      case 'form': return t('chat.mode.form');
      case 'debug': return t('chat.mode.debug');
    }
  };

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
              aria-label={t('chat.modeLabel')}
              aria-haspopup="listbox"
              aria-expanded={modeMenuOpen}
              aria-controls={modeMenuId}
              onClick={() => setModeMenuOpen((open) => !open)}
              onKeyDown={handleModeKeyDown}
            >
              {modeLabel(props.mode)}
            </button>
            <span className="bh-modeSelectArrow" data-open={modeMenuOpen} aria-hidden="true">
              <ModeChevron size={15} />
            </span>
            {modeMenuOpen ? (
              <ul className="bh-modeMenu" id={modeMenuId} role="listbox" aria-label={t('chat.modeLabel')}>
                {primaryRunModes.map((mode) => (
                  <li key={mode} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={props.mode === mode}
                      className={props.mode === mode ? 'is-selected' : undefined}
                      onClick={() => chooseMode(mode)}
                    >
                      <span>{modeLabel(mode)}</span>
                      {props.mode === mode ? <Check aria-hidden="true" size={16} /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </span>
          <input
            aria-label={t('chat.taskLabel')}
            placeholder={t('chat.placeholder')}
            value={props.task}
            onChange={(event) => props.onTaskChange(event.currentTarget.value)}
          />
          {props.canStop ? (
            <button
              type="button"
              aria-label={t('chat.pauseAria')}
              className="bh-pauseButton"
              onClick={props.onStop}
            >
              <Pause aria-hidden="true" size={18} />
            </button>
          ) : (
            <button type="submit" aria-label={t('chat.startAria')} className="bh-sendButton" disabled={props.busy}>
              <Send aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
