import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { RunStateBadge } from '../../../../src/ui/components/run-state-badge';

describe('RunStateBadge', () => {
  it('renders run display states with Chinese labels', () => {
    const html = renderToString(
      <>
        <RunStateBadge state="observing" />
        <RunStateBadge state="thinking" />
        <RunStateBadge state="executing_tool" />
        <RunStateBadge state="waiting_for_approval" />
        <RunStateBadge state="waiting_for_user" />
        <RunStateBadge state="recovering" />
        <RunStateBadge state="cancelled" />
      </>
    );

    expect(html).toContain('观察中');
    expect(html).toContain('思考中');
    expect(html).toContain('执行工具');
    expect(html).toContain('等待审批');
    expect(html).toContain('等待用户');
    expect(html).toContain('恢复中');
    expect(html).toContain('已取消');
  });
});
