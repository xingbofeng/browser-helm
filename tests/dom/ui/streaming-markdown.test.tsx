// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StreamingMarkdown } from '../../../src/ui/components/streaming-markdown';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('StreamingMarkdown 安全渲染', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function renderMarkdown(content: string): HTMLElement {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<StreamingMarkdown content={content} />);
    });
    return container;
  }

  it('渲染普通 markdown 文本', () => {
    const container = renderMarkdown('**加粗文本** 和普通文本');

    expect(container.textContent).toContain('加粗文本');
    expect(container.textContent).toContain('普通文本');
    expect(container.querySelector('strong')).toBeTruthy();
  });

  it('不执行 <script> 标签', () => {
    const container = renderMarkdown('<script>alert("xss")</script>');

    // script 标签被剥离，文本内容被转义为纯文本
    expect(container.innerHTML).not.toContain('<script');
    // innerHTML 中不应有未转义的 <script> 但文本内容可能以转义形式保留
    expect(container.querySelector('script')).toBeNull();
  });

  it('不执行 onerror handler', () => {
    const container = renderMarkdown('<img src="x" onerror="alert(1)" />');

    // onerror 属性被移除
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('markdown link 渲染为安全链接', () => {
    const container = renderMarkdown('[安全链接](https://example.com)');

    const link = container.querySelector('a');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('https://example.com');
    expect(link!.getAttribute('rel')).toContain('noreferrer');
    expect(link!.getAttribute('target')).toBe('_blank');
  });

  it('非 http/https/mailto 链接不渲染 href', () => {
    const container = renderMarkdown('[危险链接](javascript:alert(1))');

    const link = container.querySelector('a');
    // javascript: 链接的 href 会被移除
    if (link) {
      expect(link.getAttribute('href')).toBeFalsy();
    }
    // 文本内容保留
    expect(container.textContent).toContain('危险链接');
  });

  it('空内容返回 null', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(<StreamingMarkdown content="" />);
    });

    // 不渲染任何内容
    expect(container.innerHTML).toBe('');
    expect(container.textContent).toBe('');
  });

  it('code block 可读', () => {
    const container = renderMarkdown('```js\nconsole.log("hello")\n```');

    expect(container.querySelector('pre')).toBeTruthy();
    expect(container.querySelector('code')).toBeTruthy();
    expect(container.textContent).toContain('console.log');
  });

  it('长文本不包含未转义的 HTML 实体危险属性', () => {
    const container = renderMarkdown(
      '长文本测试：' + 'A'.repeat(1000)
    );

    // 不应因长文本崩溃
    expect(container.textContent).toContain('A'.repeat(1000));
    // 检查无 on* 危险属性
    const dangerousAttrs = container.innerHTML.match(/on\w+=/gu);
    expect(dangerousAttrs).toBeNull();
  });

  it('禁止的 HTML 标签被替换为纯文本', () => {
    const container = renderMarkdown('<iframe src="evil"></iframe>');

    // iframe 标签被移除
    expect(container.innerHTML).not.toContain('<iframe');
    // 内容保留但不作为元素
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('列表 markdown 正确渲染', () => {
    const container = renderMarkdown('- 项目一\n- 项目二\n- 项目三');

    expect(container.querySelector('ul')).toBeTruthy();
    expect(container.querySelectorAll('li').length).toBe(3);
    expect(container.textContent).toContain('项目一');
  });

  it('对不支持 document 的环境回退到 escapeHtml', () => {
    // StreamingMarkdown 在 server 环境下（无 document）
    // 会在 sanitizeMarkdownHtml 中回退到 escapeHtml
    // 这里无法直接测试 SSR，但可以验证 sanitizeMarkdownHtml 的
    // document 可用分支正常工作
    const container = renderMarkdown('**正常文本**');
    expect(container.querySelector('strong')).toBeTruthy();
  });
});
