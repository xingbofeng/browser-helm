// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n/context';
import { StructuredPayload } from '../../../src/ui/components/structured-payload';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('StructuredPayload 安全渲染', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function renderPayload(value: unknown, maxDepth = 4): HTMLElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<I18nProvider initialLocale="en"><StructuredPayload value={value} maxDepth={maxDepth} /></I18nProvider>);
    });
    return container;
  }

  it('null 显示为字符串 "null"', () => {
    const container = renderPayload(null);
    expect(container.textContent).toBe('null');
    expect(container.querySelector('.is-muted')).toBeTruthy();
  });

  it('undefined 显示为字符串 "undefined"', () => {
    const container = renderPayload(undefined);
    expect(container.textContent).toBe('undefined');
    expect(container.querySelector('.is-muted')).toBeTruthy();
  });

  it('字符串以引号形式展示', () => {
    const container = renderPayload('hello');
    expect(container.textContent).toBe('"hello"');
  });

  it('数字保持原样', () => {
    const container = renderPayload(42);
    expect(container.textContent).toBe('42');
  });

  it('布尔值保持原样', () => {
    const container = renderPayload(false);
    expect(container.textContent).toBe('false');
  });

  it('空数组显示 []', () => {
    const container = renderPayload([]);
    expect(container.textContent).toBe('[]');
  });

  it('数组逐项展示索引', () => {
    const container = renderPayload(['a', 'b', 'c']);
    expect(container.querySelector('ol')).toBeTruthy();
    expect(container.textContent).toContain('[0]');
    expect(container.textContent).toContain('"a"');
    expect(container.textContent).toContain('[1]');
    expect(container.textContent).toContain('"b"');
    expect(container.textContent).toContain('[2]');
    expect(container.textContent).toContain('"c"');
  });

  it('超过 12 项的数组截断并显示剩余数', () => {
    const largeArray = Array.from({ length: 20 }, (_, i) => `item-${i}`);
    const container = renderPayload(largeArray);
    expect(container.textContent).toContain('8 more items');
  });

  it('空对象显示 {}', () => {
    const container = renderPayload({});
    expect(container.textContent).toBe('{}');
  });

  it('普通对象逐行展示 key-value', () => {
    const container = renderPayload({ name: 'Counter', age: 30 });
    expect(container.querySelector('dl')).toBeTruthy();
    expect(container.textContent).toContain('name');
    expect(container.textContent).toContain('"Counter"');
    expect(container.textContent).toContain('age');
    expect(container.textContent).toContain('30');
  });

  it('超过 16 个 key 的对象截断', () => {
    const largeObj: Record<string, number> = {};
    for (let i = 0; i < 20; i++) {
      largeObj[`key${i}`] = i;
    }
    const container = renderPayload(largeObj);
    expect(container.textContent).toContain('4 more items');
  });

  it('超过 maxDepth 深层嵌套折叠', () => {
    const deep = {
      a: {
        b: {
          c: { d: { e: 'deep value' } }
        }
      }
    };
    const container = renderPayload(deep, 2);
    // 深度超过 2 的嵌套应显示折叠标签 {N 项}
    const mutedLabels = container.querySelectorAll('.is-muted');
    expect(mutedLabels.length).toBeGreaterThan(0);
    // 深层值不应暴露
    expect(container.textContent).not.toContain('deep value');
  });

  it('嵌套数组和对象的混合结构', () => {
    const mixed = {
      name: 'test',
      items: [
        { id: 1, label: 'a' },
        { id: 2, label: 'b' }
      ]
    };
    const container = renderPayload(mixed);
    expect(container.textContent).toContain('name');
    expect(container.textContent).toContain('"test"');
    expect(container.textContent).toContain('items');
    expect(container.textContent).toContain('[0]');
    expect(container.textContent).toContain('id');
    expect(container.textContent).toContain('1');
  });

  it('BigInt 转为字符串展示', () => {
    const container = renderPayload(BigInt(9007199254740991));
    expect(container.textContent).toContain('9007199254740991');
  });

  it('Symbol 转为字符串展示', () => {
    const sym = Symbol('test');
    const container = renderPayload(sym);
    expect(container.textContent).toContain('Symbol');
  });

  it('函数显示为 [function]', () => {
    const container = renderPayload(() => {});
    expect(container.textContent).toBe('[function]');
  });

  it('长 JSON 不撑坏布局（结构展开但 CSS 控制宽度）', () => {
    const longValue = {
      data: 'x'.repeat(5000)
    };
    const container = renderPayload(longValue);
    // 不应抛出错误
    expect(container.textContent).toContain('x');
    expect(container.querySelector('dl')).toBeTruthy();
  });

  it('class 为 bh-structuredPayload', () => {
    const container = renderPayload({});
    expect(container.querySelector('.bh-structuredPayload')).toBeTruthy();
  });
});
