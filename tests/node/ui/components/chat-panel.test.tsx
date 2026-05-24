import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ChatPanel } from '../../../../src/ui/components/chat-panel';

describe('ChatPanel', () => {
  it('renders task input, bilingual run mode options, start and stop controls', () => {
    const html = renderToString(
      <ChatPanel
        task="观察当前页面"
        mode="act"
        runState="idle"
        busy={false}
        canStop={true}
        onTaskChange={() => undefined}
        onModeChange={() => undefined}
        onStart={() => undefined}
        onStop={() => undefined}
      />
    );

    expect(html).toContain('观察当前页面');
    expect(html).toContain('询问 / Ask');
    expect(html).toContain('调试 / Debug');
    expect(html).toContain('表单 / Form');
    expect(html).toContain('动作准备 / Act');
    expect(html).toContain('aria-label="启动任务"');
    expect(html).toContain('aria-label="停止任务"');
  });
});
