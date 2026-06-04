import { ExternalLink, Eye, EyeOff, RadioTower, X } from 'lucide-react';
import { Button, Input, Switch } from 'animal-island-ui';
import { useState } from 'react';

import type {
  RuntimeProviderSettings,
  RuntimeProviderTestResult
} from '../../runtime/runtime-messages';
import { useT, useLocale, useSetLocale } from '../../i18n/context';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '../../i18n/types';

type ModelConfigFormProps = {
  settings?: RuntimeProviderSettings | undefined;
  maskedApiKey?: string | undefined;
  onClose: () => void;
  onSave: (settings: RuntimeProviderSettings) => Promise<void>;
  onTest: (settings: RuntimeProviderSettings) => Promise<RuntimeProviderTestResult>;
};

type SettingsTab = 'general' | 'model' | 'shortcuts';

const SETTINGS_TABS: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: 'general', labelKey: 'settings.tab.general' },
  { id: 'model', labelKey: 'settings.tab.model' },
  { id: 'shortcuts', labelKey: 'settings.tab.shortcuts' }
];

const SHORTCUTS = [
  ['settings.shortcut.downloadMarkdown', 'Alt+Shift+M'],
  ['settings.shortcut.explain', 'Alt+Shift+E'],
  ['settings.shortcut.translate', 'Alt+Shift+T'],
  ['settings.shortcut.captureViewport', undefined],
  ['settings.shortcut.captureFullPage', undefined],
  ['settings.shortcut.collectImages', undefined]
] as const;

export function ModelConfigForm(props: ModelConfigFormProps) {
  const t = useT();
  const currentLocale = useLocale();
  const setLocale = useSetLocale();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(props.settings?.baseUrl ?? '');
  const [model, setModel] = useState(props.settings?.model ?? '');
  const [apiKeyPersistence, setApiKeyPersistence] = useState(
    props.settings?.apiKeyPersistence ?? 'local'
  );
  const [streamingEnabled, setStreamingEnabled] = useState(
    props.settings?.streamingEnabled ?? true
  );
  const [allowLocalProviderEndpoints, setAllowLocalProviderEndpoints] = useState(
    props.settings?.allowLocalProviderEndpoints ?? false
  );
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<RuntimeProviderTestResult>();

  const nextSettings = (): RuntimeProviderSettings => ({
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : props.settings?.apiKey ? { apiKey: props.settings.apiKey } : {}),
    apiKeyPersistence,
    streamingEnabled,
    allowLocalProviderEndpoints
  });
  const usesLocalProviderEndpoint = isLocalProviderEndpoint(baseUrl);
  const sessionApiKeyMissing = Boolean(
    baseUrl.trim() &&
    model.trim() &&
    apiKeyPersistence === 'session' &&
    !apiKey &&
    !props.settings?.apiKey
  );

  const testConnection = async () => {
    setBusy(true);
    try {
      setTestResult(await props.onTest(nextSettings()));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await props.onSave(nextSettings());
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-modelConfig">
      <div className="bh-settingsTabs" role="tablist" aria-label={t('settings.title')}>
        {SETTINGS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-selected' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === 'general' ? (
        <div className="bh-settingsTabPanel" role="tabpanel">
          <div className="bh-providerStatus">
            <span className="bh-statusDot" aria-hidden="true" />
            <span>{t('settings.localConfig')}</span>
            <small>{t('settings.localConfigNote')}</small>
          </div>

          <div className="bh-switchRow">
            <div>
              <strong>{t('settings.language')}</strong>
              <small>{t('settings.languageLabel')}</small>
            </div>
            <div className="bh-localeSelect">
              {SUPPORTED_LOCALES.map((locale) => (
                <button
                  key={locale}
                  type="button"
                  className={locale === currentLocale ? 'bh-localeOption is-selected' : 'bh-localeOption'}
                  onClick={() => setLocale(locale)}
                >
                  {LOCALE_LABELS[locale]}
                </button>
              ))}
            </div>
          </div>

          <div className="bh-switchRow">
            <div>
              <strong>{t('settings.allowLocalProvider')}</strong>
              <small>{t('settings.allowLocalProviderNote')}</small>
            </div>
            <Switch checked={allowLocalProviderEndpoints} onChange={setAllowLocalProviderEndpoints} />
          </div>

          {usesLocalProviderEndpoint ? (
            <p className="bh-configNotice" role="status">
              {t('settings.localProviderWarning', { baseUrl: baseUrl.trim() })}
            </p>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'model' ? (
        <div className="bh-settingsTabPanel" role="tabpanel">
          <label>
            <span>{t('settings.baseUrl')}</span>
            <Input
              aria-label={t('settings.baseUrl')}
              value={baseUrl}
              placeholder={t('settings.baseUrlPlaceholder')}
              onChange={(event) => setBaseUrl(event.currentTarget.value)}
            />
          </label>

          <label>
            <span>{t('settings.model')}</span>
            <Input
              aria-label={t('settings.model')}
              value={model}
              placeholder={t('settings.modelPlaceholder')}
              onChange={(event) => setModel(event.currentTarget.value)}
            />
          </label>

          <label>
            <span>{t('settings.apiKey')}</span>
            <Input
              aria-label={t('settings.apiKey')}
              type={showKey ? 'text' : 'password'}
              placeholder={props.maskedApiKey ?? t('settings.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(event) => setApiKey(event.currentTarget.value)}
              suffix={
                <button
                  type="button"
                  className="bh-iconButtonInline"
                  aria-label={showKey ? t('settings.hideApiKey') : t('settings.showApiKey')}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              }
            />
            <small>{t('settings.apiKeyNotice')}</small>
          </label>
          {sessionApiKeyMissing ? (
            <p className="bh-configNotice" role="status">
              {t('settings.apiKeyMissingSessionWarning')}
            </p>
          ) : null}

          <div className="bh-switchRow">
            <div>
              <strong>{t('settings.apiKeyStorage')}</strong>
              <small>
                {apiKeyPersistence === 'local'
                  ? t('settings.apiKeyStorageLocalWarning')
                  : t('settings.apiKeyStorageSessionNote')}
              </small>
            </div>
            <div className="bh-localeSelect" role="group" aria-label={t('settings.apiKeyStorage')}>
              <button
                type="button"
                className={apiKeyPersistence === 'session' ? 'bh-localeOption is-selected' : 'bh-localeOption'}
                onClick={() => setApiKeyPersistence('session')}
              >
                {t('settings.apiKeyStorageSession')}
              </button>
              <button
                type="button"
                className={apiKeyPersistence === 'local' ? 'bh-localeOption is-selected' : 'bh-localeOption'}
                onClick={() => setApiKeyPersistence('local')}
              >
                {t('settings.apiKeyStorageLocal')}
              </button>
            </div>
          </div>

          <div className="bh-switchRow">
            <div>
              <strong>{t('settings.streamingEnabled')}</strong>
              <small>{t('settings.streamingNote')}</small>
            </div>
            <Switch checked={streamingEnabled} onChange={setStreamingEnabled} />
          </div>

          <div className="bh-testConnection">
            <Button
              htmlType="button"
              size="small"
              icon={<RadioTower size={15} />}
              disabled={!baseUrl.trim() || !model.trim()}
              loading={busy}
              onClick={() => {
                void testConnection();
              }}
            >
              {t('settings.testConnection')}
            </Button>
            {testResult ? (
              <p data-result-ok={testResult.ok}>
                {testResult.message}
                {testResult.supportsStreaming ? t('settings.streamingSupported') : ''}
              </p>
            ) : null}
          </div>

          <p className="bh-configNotice">
            {t('settings.debugNotice')}
          </p>
        </div>
      ) : null}

      {activeTab === 'shortcuts' ? (
        <div className="bh-settingsTabPanel" role="tabpanel">
          <div className="bh-shortcutList">
            {SHORTCUTS.map(([labelKey, shortcut]) => (
              <div key={labelKey} className="bh-shortcutRow">
                <span>{t(labelKey)}</span>
                <kbd className="bh-shortcutKey">
                  {shortcut ?? t('settings.shortcut.unassigned')}
                </kbd>
              </div>
            ))}
          </div>
          <p className="bh-configNotice">
            {t('settings.shortcutsHint')}
          </p>
          <Button
            htmlType="button"
            size="small"
            icon={<ExternalLink size={15} />}
            onClick={() => {
              void openChromeShortcutSettings();
            }}
          >
            {t('settings.openShortcuts')}
          </Button>
        </div>
      ) : null}

      <div className="bh-modalActions">
        <Button htmlType="button" onClick={props.onClose} icon={<X size={15} />}>
          {t('settings.cancel')}
        </Button>
        <Button
          htmlType="button"
          type="primary"
          loading={busy}
          onClick={() => {
            void save();
          }}
        >
          {t('settings.save')}
        </Button>
      </div>
    </div>
  );
}

async function openChromeShortcutSettings(): Promise<void> {
  await globalThis.chrome?.tabs?.create?.({
    url: 'chrome://extensions/shortcuts'
  }).catch(() => undefined);
}

function isLocalProviderEndpoint(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' && (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]' ||
      parsed.hostname === '::1'
    );
  } catch {
    return false;
  }
}
