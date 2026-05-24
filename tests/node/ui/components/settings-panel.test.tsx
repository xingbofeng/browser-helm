import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SettingsPanel } from '../../../../src/ui/components/settings-panel';

describe('SettingsPanel', () => {
  it('renders provider settings, masked key and policy placeholders', () => {
    const html = renderToString(
      <SettingsPanel
        baseUrl="https://api.example.com/v1"
        model="gpt-test"
        maskedApiKey="sk-...1234"
        policyPlaceholders={[
          { id: 'read_only_default', label: '默认只读', status: 'reserved' },
          { id: 'confirm_before_submit', label: '提交前确认', status: 'reserved' }
        ]}
        onSave={() => undefined}
      />
    );

    expect(html).toContain('https://api.example.com/v1');
    expect(html).toContain('gpt-test');
    expect(html).toContain('sk-...1234');
    expect(html).toContain('type="password"');
    expect(html).toContain('默认只读');
    expect(html).toContain('提交前确认');
    expect(html).toContain('预留');
  });
});
