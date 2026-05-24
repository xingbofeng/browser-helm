import { useRef } from 'react';

import type { PolicyPlaceholder } from '../stores/settings-store';

type SettingsPanelProps = {
  baseUrl: string;
  model: string;
  maskedApiKey: string;
  policyPlaceholders: PolicyPlaceholder[];
  onSave: (settings: { baseUrl: string; model: string; apiKey?: string }) => void;
};

export function SettingsPanel(props: SettingsPanelProps) {
  const baseUrlRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  return (
    <section className="bh-settingsPanel">
      <details>
        <summary>
          <span>Settings</span>
          <small>{props.maskedApiKey || '未配置 API Key'}</small>
        </summary>
        <label>
          Base URL
          <input
            key={`base-url-${props.baseUrl}`}
            ref={baseUrlRef}
            aria-label="Base URL"
            defaultValue={props.baseUrl}
          />
        </label>
        <label>
          Model
          <input
            key={`model-${props.model}`}
            ref={modelRef}
            aria-label="Model"
            defaultValue={props.model}
          />
        </label>
        <label>
          API Key
          <input
            key={`api-key-${props.maskedApiKey}`}
            ref={apiKeyRef}
            aria-label="API Key"
            type="password"
            placeholder={props.maskedApiKey}
          />
        </label>
        <ul>
          {props.policyPlaceholders.map((item) => (
            <li key={item.id}>
              {item.label} - {item.status === 'reserved' ? '预留' : '已启用'}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            props.onSave({
              baseUrl: baseUrlRef.current?.value ?? props.baseUrl,
              model: modelRef.current?.value ?? props.model,
              ...(apiKeyRef.current?.value ? { apiKey: apiKeyRef.current.value } : {})
            })
          }
        >
          Save
        </button>
      </details>
    </section>
  );
}
