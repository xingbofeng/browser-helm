import { describe, expect, it } from 'vitest';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';

describe('iframe / frame 命名兼容', () => {
  it('当前公开 iframe 工具只保留只读读取能力', () => {
    expect(TOOL_NAMES.IFRAME_LIST).toBe('bh_iframe_list');
    expect(TOOL_NAMES.IFRAME_READ).toBe('bh_iframe_read');
    expect(Object.values(TOOL_NAMES)).not.toContain('bh_iframe_click');
    expect(Object.values(TOOL_NAMES)).not.toContain('bh_iframe_type');
  });

  it('旧名称 bh_frame_list 保留作为兼容别名', () => {
    expect(TOOL_NAMES.FRAME_LIST).toBe('bh_frame_list');
  });

  it('公开 iframe 工具名以 bh_iframe_ 开头', () => {
    const iframeTools = [TOOL_NAMES.IFRAME_LIST, TOOL_NAMES.IFRAME_READ];
    for (const tool of iframeTools) {
      expect(tool, `${tool} 应以 bh_iframe_ 开头`).toMatch(/^bh_iframe_/);
    }
  });

  it('frame 命名与 iframe 命名不冲突', () => {
    expect(TOOL_NAMES.FRAME_LIST).not.toBe(TOOL_NAMES.IFRAME_LIST);
  });

  it('新工具不应以 bh_frame_ 添加（除了已有的 FRAME_LIST 别名）', () => {
    const frameTools = Object.values(TOOL_NAMES).filter((name) => name.startsWith('bh_frame_'));
    expect(frameTools).toEqual([TOOL_NAMES.FRAME_LIST]);
  });
});
