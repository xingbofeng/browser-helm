import { describe, expect, it } from 'vitest';

import { DefaultToolRuntimeAdapter } from '../../../../../../src/background/runtime/run/tools/adapters/default-tool-runtime-adapter';
import { TOOL_NAMES } from '../../../../../../src/shared/constants/tool-names';

describe('DefaultToolRuntimeAdapter', () => {
  const adapter = new DefaultToolRuntimeAdapter();

  it('lets self-approval tools create their own approval preview', () => {
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.CLIPBOARD_READ_WITH_APPROVAL)).toBe(true);
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.CLIPBOARD_WRITE_WITH_APPROVAL)).toBe(true);
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.FILE_READ_DOWNLOAD)).toBe(true);
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.FILE_UPLOAD_WITH_APPROVAL)).toBe(true);
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.FLOW_RUN_WITH_APPROVAL)).toBe(true);
  });

  it('keeps ordinary action tools behind policy interception', () => {
    expect(adapter.shouldBypassPolicyApproval(TOOL_NAMES.ACTION_CLICK)).toBe(false);
  });
});
