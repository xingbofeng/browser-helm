import type { PolicyPlaceholder } from '../stores/settings-store';

type SettingsPanelProps = {
  baseUrl: string;
  model: string;
  maskedApiKey: string;
  policyPlaceholders: PolicyPlaceholder[];
  onSave: (settings: { baseUrl: string; model: string; apiKey?: string }) => void;
};

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <section className="bh-settingsPanel">
      <h2>Settings</h2>
      <label>
        Base URL
        <input aria-label="Base URL" defaultValue={props.baseUrl} />
      </label>
      <label>
        Model
        <input aria-label="Model" defaultValue={props.model} />
      </label>
      <label>
        API Key
        <input aria-label="API Key" type="password" placeholder={props.maskedApiKey} />
      </label>
      <p>{props.maskedApiKey}</p>
      <ul>
        {props.policyPlaceholders.map((item) => (
          <li key={item.id}>
            {item.label} - {item.status === 'reserved' ? '预留' : '已启用'}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => props.onSave({ baseUrl: props.baseUrl, model: props.model })}
      >
        Save
      </button>
    </section>
  );
}
