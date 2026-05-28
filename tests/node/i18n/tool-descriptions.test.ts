import { describe, expect, it } from 'vitest';

import { TOOL_DESCRIPTION_KEYS, toolDescription } from '../../../src/i18n/tool-descriptions';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import { t } from '../../../src/i18n/t';

describe('localized tool descriptions', () => {
  it('maps every tool to an i18n key', () => {
    const toolNames = Object.values(TOOL_NAMES);

    expect(Object.keys(TOOL_DESCRIPTION_KEYS).sort()).toEqual([...toolNames].sort());
    for (const toolName of toolNames) {
      const key = TOOL_DESCRIPTION_KEYS[toolName];
      expect(key).toMatch(/^tool\.description\./u);
      expect(t(key, 'zh')).not.toBe(key);
      expect(t(key, 'en')).not.toBe(key);
    }
  });

  it('returns descriptions from the requested locale dictionary', () => {
    expect(toolDescription(TOOL_NAMES.PAGE_OBSERVE, 'zh')).toBe('观察当前页面，并返回有边界的页面摘要。');
    expect(toolDescription(TOOL_NAMES.PAGE_OBSERVE, 'en')).toBe('Observes the current page and returns a bounded summary');
  });
});
