import { describe, expect, it } from 'vitest';

import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';

describe('iframe / frame 命名兼容', () => {
  it('产品语义使用 iframe（新名称）工具名', () => {
    // 新名称工具
    expect(TOOL_NAMES.IFRAME_LIST).toBe('bh_iframe_list');
    expect(TOOL_NAMES.IFRAME_READ).toBe('bh_iframe_read');
    expect(TOOL_NAMES.IFRAME_CLICK).toBe('bh_iframe_click');
    expect(TOOL_NAMES.IFRAME_TYPE).toBe('bh_iframe_type');
  });

  it('旧名称 bh_frame_list 保留作为兼容别名', () => {
    expect(TOOL_NAMES.FRAME_LIST).toBe('bh_frame_list');
  });

  it('所有 iframe 工具名以 bh_iframe_ 开头', () => {
    const iframeTools = [
      TOOL_NAMES.IFRAME_LIST,
      TOOL_NAMES.IFRAME_READ,
      TOOL_NAMES.IFRAME_CLICK,
      TOOL_NAMES.IFRAME_TYPE
    ];
    for (const tool of iframeTools) {
      expect(tool, `${tool} 应以 bh_iframe_ 开头`).toMatch(/^bh_iframe_/);
    }
  });

  it('frame 命名与 iframe 命名不冲突', () => {
    // FRAME_LIST 是旧名，IFRAME_LIST 是新名，值不同
    expect(TOOL_NAMES.FRAME_LIST).not.toBe(TOOL_NAMES.IFRAME_LIST);
  });

  it('工具名不包含混乱的 frame/iframe 混合拼写', () => {
    const allToolNames = Object.values(TOOL_NAMES);
    // 不应同时出现 bh_frame 和 bh_iframe 在同一个工具名中
    for (const name of allToolNames) {
      expect(name).not.toMatch(/^bh_frame_(?!list$)/); // frame_list 是允许的旧别名
    }
  });

  it('新工具不应以 bh_frame_ 添加（除了已有的 FRAME_LIST 别名）', () => {
    const frameTools = Object.values(TOOL_NAMES).filter(
      (name) => name.startsWith('bh_frame_')
    );
    // 目前只有 bh_frame_list 作为旧别名保留
    expect(frameTools).toEqual([TOOL_NAMES.FRAME_LIST]);
  });
});
