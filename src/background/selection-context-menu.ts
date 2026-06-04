import type { ExecuteToolInput, StartRunInput } from '../runtime/runtime-messages';
import {
  SELECTION_MARKDOWN_DOWNLOAD_MESSAGE,
  SELECTION_MARKDOWN_MENU_ID
} from '../shared/constants/selection-markdown';
import { TOOL_NAMES, type ToolName } from '../shared/constants/tool-names';
import { downloadVisionToolResult } from './selection-context-download';

export const SELECTION_CONTEXT_MENU_IDS = {
  root: 'browserhelm-root',
  explain: 'browserhelm-selection-explain',
  translate: 'browserhelm-selection-translate',
  captureViewport: 'browserhelm-vision-capture-viewport',
  captureFullPage: 'browserhelm-vision-capture-full-page',
  collectImages: 'browserhelm-vision-collect-images'
} as const;

type TextSelectionAction = 'explain' | 'translate';
type VisionContextAction = 'captureViewport' | 'captureFullPage' | 'collectImages';
type DownloadContextAction = 'downloadMarkdown';
type SelectionContextAction = TextSelectionAction | VisionContextAction | DownloadContextAction;

type ContextMenuDefinition = {
  action: SelectionContextAction;
  id: string;
  title: string;
  contexts: MenuContexts;
};

type MenuContexts = NonNullable<chrome.contextMenus.CreateProperties['contexts']>;

type ContextMenusApi = {
  create: (properties: chrome.contextMenus.CreateProperties) => void;
  removeAll: (callback?: () => void) => void;
  onClicked: {
    addListener: (
      callback: (
        info: SelectionClickInfo,
        tab?: Pick<chrome.tabs.Tab, 'id'>
      ) => void
    ) => void;
  };
};

type SelectionClickInfo = {
  menuItemId: string | number;
  selectionText?: string | undefined;
  frameId?: number | undefined;
};
type SelectionClickTab = Pick<chrome.tabs.Tab, 'id'> | undefined;

type SelectionContextDeps = {
  startRun: (input: StartRunInput) => Promise<{ runId: string }>;
  executeTool?: ((input: ExecuteToolInput) => Promise<unknown>) | undefined;
  downloadToolResult?: ((input: {
    tabId: number;
    frameId?: number;
    tool: ToolName;
    result: unknown;
  }) => Promise<void>) | undefined;
  openSidePanelForTab?: ((tabId: number) => Promise<void>) | undefined;
  openSidePanelForRun: (tabId: number, runId: string) => Promise<void>;
};

const BROWSERHELM_MENU_CONTEXTS: MenuContexts = ['page', 'selection', 'link', 'image'];
const SELECTION_ONLY_CONTEXTS: MenuContexts = ['selection'];

const CONTEXT_MENU_DEFINITIONS: ContextMenuDefinition[] = [
  {
    action: 'downloadMarkdown',
    id: SELECTION_MARKDOWN_MENU_ID,
    title: '下载选区为 Markdown',
    contexts: SELECTION_ONLY_CONTEXTS
  },
  {
    action: 'explain',
    id: SELECTION_CONTEXT_MENU_IDS.explain,
    title: '解释选中文字',
    contexts: SELECTION_ONLY_CONTEXTS
  },
  {
    action: 'translate',
    id: SELECTION_CONTEXT_MENU_IDS.translate,
    title: '翻译选中文字',
    contexts: SELECTION_ONLY_CONTEXTS
  },
  {
    action: 'captureViewport',
    id: SELECTION_CONTEXT_MENU_IDS.captureViewport,
    title: '截取当前视口',
    contexts: BROWSERHELM_MENU_CONTEXTS
  },
  {
    action: 'captureFullPage',
    id: SELECTION_CONTEXT_MENU_IDS.captureFullPage,
    title: '截取当前页面长图',
    contexts: BROWSERHELM_MENU_CONTEXTS
  },
  {
    action: 'collectImages',
    id: SELECTION_CONTEXT_MENU_IDS.collectImages,
    title: '获取当前页面全部图片',
    contexts: BROWSERHELM_MENU_CONTEXTS
  }
];

export function buildSelectionContextTask(
  action: TextSelectionAction,
  selectionText: string | undefined
): string | undefined {
  const text = selectionText?.trim();
  if (!text) {
    return undefined;
  }
  if (action === 'translate') {
    return [
      '请把以下选中文本翻译成中文。',
      '保留专有名词、代码、URL 和原始格式；如果原文已经是中文，请说明其含义。',
      '',
      '选中文本开始',
      text,
      '选中文本结束'
    ].join('\n');
  }
  return [
    '请用中文解释以下选中文本。',
    '请说明核心含义、上下文可能指向什么，以及需要注意的术语。',
    '',
    '选中文本开始',
    text,
    '选中文本结束'
  ].join('\n');
}

export function registerSelectionContextMenus(input: {
  contextMenus?: ContextMenusApi | undefined;
  onClick: (
    info: SelectionClickInfo,
    tab?: SelectionClickTab
  ) => void;
}): void {
  const contextMenus = input.contextMenus;
  if (!contextMenus) {
    return;
  }
  contextMenus.removeAll(() => {
    for (const definition of CONTEXT_MENU_DEFINITIONS) {
      contextMenus.create({
        id: definition.id,
        title: definition.title,
        contexts: definition.contexts
      });
    }
  });
  contextMenus.onClicked.addListener(input.onClick);
}

export async function handleSelectionContextMenuClick(
  info: SelectionClickInfo,
  tab: SelectionClickTab,
  deps: SelectionContextDeps
): Promise<void> {
  const action = actionFromMenuId(info.menuItemId);
  const tabId = tab?.id;
  if (!action || !tabId) {
    return;
  }
  if (action === 'downloadMarkdown') {
    const options = typeof info.frameId === 'number' ? { frameId: info.frameId } : undefined;
    await globalThis.chrome?.tabs?.sendMessage?.(
      tabId,
      { type: SELECTION_MARKDOWN_DOWNLOAD_MESSAGE },
      options
    ).catch(() => undefined);
    return;
  }
  if (isVisionAction(action)) {
    if (!deps.executeTool) {
      return;
    }
    const started = await deps.startRun({
      task: visionTaskForAction(action),
      mode: 'debug',
      runKind: 'observe_only',
      tabId
    });
    const tool = visionToolForAction(action);
    const result = await deps.executeTool({
      runId: started.runId,
      tool,
      args: visionToolArgsForAction(action)
    });
    const downloadToolResultForAction = deps.downloadToolResult ?? downloadVisionToolResult;
    await downloadToolResultForAction({
      tabId,
      ...(typeof info.frameId === 'number' ? { frameId: info.frameId } : {}),
      tool,
      result
    });
    return;
  }
  const task = buildSelectionContextTask(action, info.selectionText);
  if (!task) {
    return;
  }
  await deps.openSidePanelForTab?.(tabId);
  const started = await deps.startRun({
    task,
    mode: 'ask',
    tabId
  });
  await deps.openSidePanelForRun(tabId, started.runId);
}

function actionFromMenuId(menuItemId: string | number): SelectionContextAction | undefined {
  if (menuItemId === SELECTION_CONTEXT_MENU_IDS.explain) {
    return 'explain';
  }
  if (menuItemId === SELECTION_MARKDOWN_MENU_ID) {
    return 'downloadMarkdown';
  }
  if (menuItemId === SELECTION_CONTEXT_MENU_IDS.translate) {
    return 'translate';
  }
  if (menuItemId === SELECTION_CONTEXT_MENU_IDS.captureViewport) {
    return 'captureViewport';
  }
  if (menuItemId === SELECTION_CONTEXT_MENU_IDS.captureFullPage) {
    return 'captureFullPage';
  }
  if (menuItemId === SELECTION_CONTEXT_MENU_IDS.collectImages) {
    return 'collectImages';
  }
  return undefined;
}

function isVisionAction(action: SelectionContextAction): action is VisionContextAction {
  return action === 'captureViewport' || action === 'captureFullPage' || action === 'collectImages';
}

function visionTaskForAction(action: VisionContextAction): string {
  switch (action) {
    case 'captureViewport':
      return '右键截取当前视口';
    case 'captureFullPage':
      return '右键截取当前页面长图';
    case 'collectImages':
      return '右键获取当前页面全部图片';
  }
}

function visionToolForAction(action: VisionContextAction): ToolName {
  switch (action) {
    case 'captureViewport':
      return TOOL_NAMES.VISION_CAPTURE_VIEWPORT;
    case 'captureFullPage':
      return TOOL_NAMES.VISION_BATCH_CAPTURE_FULL_PAGES;
    case 'collectImages':
      return TOOL_NAMES.VISION_COLLECT_IMAGES;
  }
}

function visionToolArgsForAction(action: VisionContextAction): ExecuteToolInput['args'] {
  if (action === 'captureFullPage' || action === 'collectImages') {
    return { scope: 'active_tab' };
  }
  return {};
}
