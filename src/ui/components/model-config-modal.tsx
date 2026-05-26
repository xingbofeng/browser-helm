import { Eye, EyeOff, RadioTower, X } from 'lucide-react';
import { Button, Input, Switch } from 'animal-island-ui';
import { useState } from 'react';

import type {
  RuntimeProviderSettings,
  RuntimeProviderTestResult
} from '../../runtime/runtime-messages';

type ModelConfigFormProps = {
  settings?: RuntimeProviderSettings | undefined;
  maskedApiKey?: string | undefined;
  onClose: () => void;
  onSave: (settings: RuntimeProviderSettings) => Promise<void>;
  onTest: (settings: RuntimeProviderSettings) => Promise<RuntimeProviderTestResult>;
};

export function ModelConfigForm(props: ModelConfigFormProps) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(props.settings?.baseUrl ?? '');
  const [model, setModel] = useState(props.settings?.model ?? '');
  const [streamingEnabled, setStreamingEnabled] = useState(
    props.settings?.streamingEnabled ?? true
  );
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<RuntimeProviderTestResult>();

  const nextSettings = (): RuntimeProviderSettings => ({
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : props.settings?.apiKey ? { apiKey: props.settings.apiKey } : {}),
    streamingEnabled
  });

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
      <div className="bh-providerStatus">
        <span className="bh-statusDot" aria-hidden="true" />
        <span>本地配置</span>
        <small>配置只保存在当前浏览器扩展中</small>
      </div>

      <label>
        <span>Base URL</span>
        <Input
          aria-label="Base URL"
          value={baseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(event) => setBaseUrl(event.currentTarget.value)}
        />
      </label>

      <label>
        <span>Model</span>
        <Input
          aria-label="Model"
          value={model}
          placeholder="gpt-4.1-mini"
          onChange={(event) => setModel(event.currentTarget.value)}
        />
      </label>

      <label>
        <span>API Key</span>
        <Input
          aria-label="API Key"
          type={showKey ? 'text' : 'password'}
          placeholder={props.maskedApiKey ?? 'sk-...'}
          value={apiKey}
          onChange={(event) => setApiKey(event.currentTarget.value)}
          suffix={
            <button
              type="button"
              className="bh-iconButtonInline"
              aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
              onClick={() => setShowKey((value) => !value)}
            >
              {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />
        <small>不会写入 Trace 或页面摘要</small>
      </label>

      <div className="bh-switchRow">
        <div>
          <strong>启用流式输出</strong>
          <small>失败时自动回退到普通完成模式</small>
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
          测试连接
        </Button>
        {testResult ? (
          <p data-result-ok={testResult.ok}>
            {testResult.message}
            {testResult.supportsStreaming ? ' · 支持 streaming' : ''}
          </p>
        ) : null}
      </div>

      <p className="bh-configNotice">
        Debug 仅显示 provider、model 和 streaming 状态，不显示完整 Key。
      </p>

      <div className="bh-modalActions">
        <Button htmlType="button" onClick={props.onClose} icon={<X size={15} />}>
          取消
        </Button>
        <Button
          htmlType="button"
          type="primary"
          loading={busy}
          onClick={() => {
            void save();
          }}
        >
          保存配置
        </Button>
      </div>
    </div>
  );
}
