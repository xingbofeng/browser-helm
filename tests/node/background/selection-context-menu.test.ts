import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSelectionContextTask,
  handleSelectionCommand,
  handleSelectionContextMenuClick,
  registerSelectionContextMenus,
  SELECTION_CONTEXT_MENU_IDS
} from '../../../src/background/selection-context-menu';
import {
  SELECTION_MARKDOWN_DOWNLOAD_MESSAGE,
  SELECTION_MARKDOWN_MENU_ID
} from '../../../src/shared/constants/selection-markdown';
import { TOOL_NAMES } from '../../../src/shared/constants/tool-names';
import type { ExecuteToolInput, StartRunInput } from '../../../src/runtime/runtime-messages';

const CAPTURE_VIEWPORT_MENU_ID = 'browserhelm-vision-capture-viewport';
const CAPTURE_FULL_PAGE_MENU_ID = 'browserhelm-vision-capture-full-page';
const COLLECT_IMAGES_MENU_ID = 'browserhelm-vision-collect-images';

describe('selection context menu task builder', () => {
  it('builds a Chinese explanation task from selected text', () => {
    const task = buildSelectionContextTask('explain', ' Progressive enhancement ');

    expect(task).toContain('请用中文解释以下选中文本');
    expect(task).toContain('Progressive enhancement');
    expect(task).toContain('选中文本开始');
  });

  it('builds a Chinese translation task from selected text', () => {
    const task = buildSelectionContextTask('translate', 'Hello browser agent');

    expect(task).toContain('请把以下选中文本翻译成中文');
    expect(task).toContain('Hello browser agent');
    expect(task).toContain('保留专有名词、代码、URL 和原始格式');
  });

  it('returns undefined for empty selected text', () => {
    expect(buildSelectionContextTask('explain', '   \n\t  ')).toBeUndefined();
    expect(buildSelectionContextTask('translate', undefined)).toBeUndefined();
  });
});

describe('selection context menu registration', () => {
  const create = vi.fn();
  const removeAll = vi.fn((callback?: () => void) => callback?.());
  const addListener = vi.fn();

  beforeEach(() => {
    create.mockClear();
    removeAll.mockClear();
    addListener.mockClear();
  });

  it('clears stale extension menu items and registers flat BrowserHelm menu items', () => {
    const onClick = vi.fn();

    registerSelectionContextMenus({
      contextMenus: {
        create,
        removeAll,
        onClicked: { addListener }
      },
      onClick
    });

    expect(removeAll).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalledWith(expect.objectContaining({
      id: SELECTION_CONTEXT_MENU_IDS.root
    }));
    expect(create).toHaveBeenCalledWith({
      id: SELECTION_MARKDOWN_MENU_ID,
      title: '下载选区为 Markdown',
      contexts: ['selection']
    });
    expect(create).toHaveBeenCalledWith({
      id: SELECTION_CONTEXT_MENU_IDS.explain,
      title: '解释选中文字',
      contexts: ['selection']
    });
    expect(create).toHaveBeenCalledWith({
      id: SELECTION_CONTEXT_MENU_IDS.translate,
      title: '翻译选中文字',
      contexts: ['selection']
    });
    for (const id of [CAPTURE_VIEWPORT_MENU_ID, CAPTURE_FULL_PAGE_MENU_ID, COLLECT_IMAGES_MENU_ID]) {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        id,
        contexts: ['page', 'selection', 'link', 'image']
      }));
    }
    for (const call of create.mock.calls) {
      expect(call[0]).not.toHaveProperty('parentId');
    }
    expect(addListener).toHaveBeenCalledWith(onClick);
  });
});

describe('selection context menu click handling', () => {
  it('ignores unknown menu ids and empty selections', async () => {
    const startRun = vi.fn();
    const openSidePanelForRun = vi.fn();

    await handleSelectionContextMenuClick(
      { menuItemId: 'other-menu', selectionText: 'hello' },
      { id: 9 },
      { startRun, openSidePanelForRun }
    );
    await handleSelectionContextMenuClick(
      { menuItemId: SELECTION_CONTEXT_MENU_IDS.explain, selectionText: ' ' },
      { id: 9 },
      { startRun, openSidePanelForRun }
    );

    expect(startRun).not.toHaveBeenCalled();
    expect(openSidePanelForRun).not.toHaveBeenCalled();
  });

  it('starts an ask run for explanation and opens the side panel for the run', async () => {
    const calls: string[] = [];
    const startRun = vi.fn(async (_input: StartRunInput) => ({ runId: 'run_explain' }));
    const openSidePanelForTab = vi.fn(async () => {
      calls.push('open-tab');
    });
    const openSidePanelForRun = vi.fn(async () => {
      calls.push('open-run');
    });
    startRun.mockImplementation(async () => {
      calls.push('start-run');
      return { runId: 'run_explain' };
    });

    await handleSelectionContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_IDS.explain,
        selectionText: 'Shadow DOM'
      },
      { id: 42 },
      { startRun, openSidePanelForTab, openSidePanelForRun }
    );

    expect(calls).toEqual(['open-tab', 'start-run', 'open-run']);
    expect(openSidePanelForTab).toHaveBeenCalledWith(42);
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun.mock.calls[0]?.[0].mode).toBe('ask');
    expect(startRun.mock.calls[0]?.[0].tabId).toBe(42);
    expect(startRun.mock.calls[0]?.[0].task).toContain('请用中文解释以下选中文本');
    expect(startRun.mock.calls[0]?.[0].task).toContain('Shadow DOM');
    expect(openSidePanelForRun).toHaveBeenCalledWith(42, 'run_explain');
  });

  it('starts an ask run for translation and opens the side panel for the run', async () => {
    const calls: string[] = [];
    const startRun = vi.fn(async (_input: StartRunInput) => ({ runId: 'run_translate' }));
    const openSidePanelForTab = vi.fn(async () => {
      calls.push('open-tab');
    });
    const openSidePanelForRun = vi.fn(async () => {
      calls.push('open-run');
    });
    startRun.mockImplementation(async () => {
      calls.push('start-run');
      return { runId: 'run_translate' };
    });

    await handleSelectionContextMenuClick(
      {
        menuItemId: SELECTION_CONTEXT_MENU_IDS.translate,
        selectionText: 'Accessibility tree'
      },
      { id: 7 },
      { startRun, openSidePanelForTab, openSidePanelForRun }
    );

    expect(calls).toEqual(['open-tab', 'start-run', 'open-run']);
    expect(openSidePanelForTab).toHaveBeenCalledWith(7);
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(startRun.mock.calls[0]?.[0].mode).toBe('ask');
    expect(startRun.mock.calls[0]?.[0].tabId).toBe(7);
    expect(startRun.mock.calls[0]?.[0].task).toContain('请把以下选中文本翻译成中文');
    expect(startRun.mock.calls[0]?.[0].task).toContain('Accessibility tree');
    expect(openSidePanelForRun).toHaveBeenCalledWith(7, 'run_translate');
  });

  it.each([
    [CAPTURE_VIEWPORT_MENU_ID, TOOL_NAMES.VISION_CAPTURE_VIEWPORT, '右键截取当前视口', {}],
    [CAPTURE_FULL_PAGE_MENU_ID, TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES, '右键截取当前页面长图', { scope: 'active_tab' }],
    [COLLECT_IMAGES_MENU_ID, TOOL_NAMES.VISION_COLLECT_IMAGES, '右键获取当前页面全部图片', { scope: 'active_tab' }]
  ])('starts a debug observe-only run, executes %s, and downloads the result', async (menuItemId, tool, task, args) => {
    const startRun = vi.fn(async (_input: StartRunInput) => ({ runId: 'run_vision' }));
    const toolResult = {
      ok: true,
      code: 'OK',
      summary: 'ok'
    };
    const executeTool = vi.fn(async (_input: ExecuteToolInput) => toolResult);
    const downloadToolResult = vi.fn(async () => undefined);
    const openSidePanelForRun = vi.fn(async () => undefined);
    const deps = { startRun, executeTool, downloadToolResult, openSidePanelForRun };

    await handleSelectionContextMenuClick(
      { menuItemId, frameId: 9 },
      { id: 23 },
      deps
    );

    expect(startRun).toHaveBeenCalledWith({
      task,
      mode: 'debug',
      runKind: 'observe_only',
      tabId: 23
    });
    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_vision',
      tool,
      args
    });
    expect(downloadToolResult).toHaveBeenCalledWith({
      tabId: 23,
      frameId: 9,
      tool,
      result: toolResult
    });
    expect(openSidePanelForRun).not.toHaveBeenCalled();
  });

  it('downloads selected Markdown through the clicked tab frame without opening the side panel', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage
      }
    });
    const startRun = vi.fn();
    const openSidePanelForRun = vi.fn();

    await handleSelectionContextMenuClick(
      { menuItemId: SELECTION_MARKDOWN_MENU_ID, frameId: 7, selectionText: 'ignored' },
      { id: 42 },
      { startRun, openSidePanelForRun }
    );

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      { type: SELECTION_MARKDOWN_DOWNLOAD_MESSAGE },
      { frameId: 7 }
    );
    expect(startRun).not.toHaveBeenCalled();
    expect(openSidePanelForRun).not.toHaveBeenCalled();
  });
});

describe('selection keyboard command handling', () => {
  it('downloads the active tab selection as Markdown without needing right-click info', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ ok: true });
    const startRun = vi.fn();

    await handleSelectionCommand('browserhelm-selection-to-markdown', {
      activeTab: { id: 42 },
      chromeApi: { tabs: { sendMessage } },
      startRun,
      openSidePanelForRun: vi.fn()
    });

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      { type: SELECTION_MARKDOWN_DOWNLOAD_MESSAGE },
      undefined
    );
    expect(startRun).not.toHaveBeenCalled();
  });

  it('reads active tab selection text before starting an explanation run', async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      selectionText: 'Keyboard selected text'
    });
    const startRun = vi.fn(async (_input: StartRunInput) => ({ runId: 'run_keyboard' }));
    const openSidePanelForTab = vi.fn(async () => undefined);
    const openSidePanelForRun = vi.fn(async () => undefined);

    await handleSelectionCommand('browserhelm-selection-explain', {
      activeTab: { id: 42 },
      chromeApi: { tabs: { sendMessage } },
      startRun,
      openSidePanelForTab,
      openSidePanelForRun
    });

    expect(sendMessage).toHaveBeenCalledWith(
      42,
      { type: 'BH_SELECTION_TEXT_READ' },
      undefined
    );
    expect(openSidePanelForTab).toHaveBeenCalledWith(42);
    expect(startRun.mock.calls[0]?.[0]).toMatchObject({
      mode: 'ask',
      tabId: 42
    });
    expect(startRun.mock.calls[0]?.[0].task).toContain('Keyboard selected text');
    expect(openSidePanelForRun).toHaveBeenCalledWith(42, 'run_keyboard');
  });

  it.each([
    ['browserhelm-vision-capture-viewport', TOOL_NAMES.VISION_CAPTURE_VIEWPORT, {}],
    ['browserhelm-vision-capture-full-page', TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES, { scope: 'active_tab' }],
    ['browserhelm-vision-collect-images', TOOL_NAMES.VISION_COLLECT_IMAGES, { scope: 'active_tab' }]
  ])('executes and downloads the active tab vision command %s', async (command, tool, args) => {
    const startRun = vi.fn(async (_input: StartRunInput) => ({ runId: 'run_vision_keyboard' }));
    const executeTool = vi.fn(async (_input: ExecuteToolInput) => ({ ok: true }));
    const downloadToolResult = vi.fn(async () => undefined);

    await handleSelectionCommand(command, {
      activeTab: { id: 42 },
      startRun,
      executeTool,
      downloadToolResult,
      openSidePanelForRun: vi.fn()
    });

    expect(executeTool).toHaveBeenCalledWith({
      runId: 'run_vision_keyboard',
      tool,
      args
    });
    expect(downloadToolResult).toHaveBeenCalledWith({
      tabId: 42,
      tool,
      result: { ok: true }
    });
  });
});
