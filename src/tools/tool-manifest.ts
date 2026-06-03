import type { ContentRpcClient } from '../page/messaging/content-rpc-client';
import type { ToolSpec } from './core/tool-spec';
import { bhA11yFindInteractive } from './a11y/bh-a11y-find-interactive';
import { bhA11yRefreshRefs } from './a11y/bh-a11y-refresh-refs';
import { bhA11yResolveRef } from './a11y/bh-a11y-resolve-ref';
import { bhA11ySnapshot } from './a11y/bh-a11y-snapshot';
import { bhActionCheckReadiness } from './action/bh-action-check-readiness';
import { bhActionClick } from './action/bh-action-click';
import {
  bhAdapterApplyLocator,
  bhAdapterDetectSite,
  bhAdapterListWorkflows,
  bhAdapterReportFailure
} from './adapter/bh-adapter-tools';
import { bhAgentAskUser } from './agent/bh-agent-ask-user';
import { bhAgentFail } from './agent/bh-agent-fail';
import { bhAgentFinish } from './agent/bh-agent-finish';
import {
  bhCdpAttach,
  bhCdpCaptureDomSnapshot,
  bhCdpDetach,
  bhCdpGetConsoleEvents,
  bhCdpGetEventListeners,
  bhCdpGetNetworkEvents,
  bhCdpGetPerformanceMetrics,
  bhCdpGetRequestDetail,
  bhCdpGetResponseBody,
  bhCdpGetTargets
} from './cdp/bh-cdp-tools';
import {
  bhClipboardReadWithApproval,
  bhClipboardWriteWithApproval
} from './clipboard/bh-clipboard-tools';
import { bhDebugCollectPageHealth } from './debug/bh-debug-collect-page-health';
import { bhDocReadUrl } from './doc/bh-doc-tools';
import {
  bhDownloadList,
  bhFileReadDownload,
  bhFileUploadWithApproval
} from './file/bh-file-tools';
import { bhFormFillField } from './form/bh-form-fill-field';
import { bhFormFillMany } from './form/bh-form-fill-many';
import { bhFormFindDisabledSubmitReason } from './form/bh-form-find-disabled-submit-reason';
import { bhFormFindMissingRequired } from './form/bh-form-find-missing-required';
import { bhFormFindValidationErrors } from './form/bh-form-find-validation-errors';
import { bhFormInferFillPlan } from './form/bh-form-infer-fill-plan';
import { bhFormInspect } from './form/bh-form-inspect';
import { bhFormList } from './form/bh-form-list';
import { bhFormReadFields } from './form/bh-form-read-fields';
import { bhFormSubmitWithApproval } from './form/bh-form-submit-with-approval';
import { bhFormVerify } from './form/bh-form-verify';
import { bhFrameList } from './frame/bh-frame-list';
import { bhIframeList } from './frame/bh-iframe-list';
import { bhIframeRead } from './frame/bh-iframe-read';
import {
  bhMemoryClearAll,
  bhMemoryClearDomain,
  bhMemoryDelete,
  bhMemoryExplainHit,
  bhMemoryList,
  bhMemoryLookup,
  bhMemorySave,
  bhMemoryUpdate
} from './memory/bh-memory-tools';
import {
  bhPadAppend,
  bhPadClear,
  bhPadCompact,
  bhPadRead,
  bhPadReplace
} from './pad/bh-pad-tools';
import { bhPageObserve } from './page/bh-page-observe';
import { bhPageReadArticle } from './page/bh-page-read-article';
import { bhPageReadVisibleText } from './page/bh-page-read-visible-text';
import { bhPageWaitUntilStable } from './page/bh-page-wait-until-stable';
import { bhPointerClick } from './pointer/bh-pointer-click';
import { bhShadowList, bhShadowQuery } from './shadow/bh-shadow-tools';
import {
  bhStorageClearWithApproval,
  bhStorageDeleteWithApproval,
  bhStorageGet,
  bhStorageList,
  bhStorageSetWithApproval
} from './storage/bh-storage-tools';
import { bhTabFocus, bhTabGetActive, bhTabList } from './tab/bh-tab-tools';
import { bhViewportGetInfo } from './viewport/bh-viewport-get-info';
import { bhViewportScroll } from './viewport/bh-viewport-scroll';
import {
  bhVisionCaptureElement,
  bhVisionCaptureFullPage,
  bhVisionCaptureViewport,
  bhVisionDescribeViewport,
  bhVisionDetectLayoutIssues,
  bhVisionDetectOverlay
} from './vision/bh-vision-tools';
import {
  bhFlowDelete,
  bhFlowLookup,
  bhFlowPreview,
  bhFlowRunWithApproval,
  bhFlowSave,
  bhFlowScore,
  bhFlowStep,
  bhFlowStop,
  bhFlowUpdate
} from './workflow/bh-flow-tools';

export type ToolFactory = (rpc: ContentRpcClient) => ToolSpec<unknown, unknown>;

export type ToolManifestEntry = {
  module: string;
  tools: ToolFactory[];
};

export const TOOL_MANIFEST_MODULES_HASH = '345d5ba3ba337e2f';

export const TOOL_MANIFEST: ToolManifestEntry[] = [
  { module: './a11y/bh-a11y-find-interactive.ts', tools: [bhA11yFindInteractive] },
  { module: './a11y/bh-a11y-refresh-refs.ts', tools: [bhA11yRefreshRefs] },
  { module: './a11y/bh-a11y-resolve-ref.ts', tools: [bhA11yResolveRef] },
  { module: './a11y/bh-a11y-snapshot.ts', tools: [bhA11ySnapshot] },
  { module: './action/bh-action-check-readiness.ts', tools: [bhActionCheckReadiness] },
  { module: './action/bh-action-click.ts', tools: [bhActionClick] },
  { module: './adapter/bh-adapter-tools.ts', tools: [bhAdapterDetectSite, bhAdapterListWorkflows, bhAdapterApplyLocator, bhAdapterReportFailure] },
  { module: './agent/bh-agent-ask-user.ts', tools: [() => bhAgentAskUser] },
  { module: './agent/bh-agent-fail.ts', tools: [() => bhAgentFail] },
  { module: './agent/bh-agent-finish.ts', tools: [() => bhAgentFinish] },
  { module: './cdp/bh-cdp-tools.ts', tools: [bhCdpAttach, bhCdpDetach, bhCdpGetTargets, bhCdpGetConsoleEvents, bhCdpGetNetworkEvents, bhCdpGetRequestDetail, bhCdpGetResponseBody, bhCdpGetPerformanceMetrics, bhCdpGetEventListeners, bhCdpCaptureDomSnapshot] },
  { module: './clipboard/bh-clipboard-tools.ts', tools: [bhClipboardReadWithApproval, bhClipboardWriteWithApproval] },
  { module: './debug/bh-debug-collect-page-health.ts', tools: [bhDebugCollectPageHealth] },
  { module: './doc/bh-doc-tools.ts', tools: [bhDocReadUrl] },
  { module: './file/bh-file-tools.ts', tools: [bhDownloadList, bhFileReadDownload, bhFileUploadWithApproval] },
  { module: './form/bh-form-fill-field.ts', tools: [bhFormFillField] },
  { module: './form/bh-form-fill-many.ts', tools: [bhFormFillMany] },
  { module: './form/bh-form-find-disabled-submit-reason.ts', tools: [bhFormFindDisabledSubmitReason] },
  { module: './form/bh-form-find-missing-required.ts', tools: [bhFormFindMissingRequired] },
  { module: './form/bh-form-find-validation-errors.ts', tools: [bhFormFindValidationErrors] },
  { module: './form/bh-form-infer-fill-plan.ts', tools: [bhFormInferFillPlan] },
  { module: './form/bh-form-inspect.ts', tools: [bhFormInspect] },
  { module: './form/bh-form-list.ts', tools: [bhFormList] },
  { module: './form/bh-form-read-fields.ts', tools: [bhFormReadFields] },
  { module: './form/bh-form-submit-with-approval.ts', tools: [bhFormSubmitWithApproval] },
  { module: './form/bh-form-verify.ts', tools: [bhFormVerify] },
  { module: './frame/bh-frame-list.ts', tools: [bhFrameList] },
  { module: './frame/bh-iframe-list.ts', tools: [bhIframeList] },
  { module: './frame/bh-iframe-read.ts', tools: [bhIframeRead] },
  { module: './memory/bh-memory-tools.ts', tools: [bhMemoryLookup, bhMemorySave, bhMemoryUpdate, bhMemoryDelete, bhMemoryList, bhMemoryClearDomain, bhMemoryClearAll, bhMemoryExplainHit] },
  { module: './pad/bh-pad-tools.ts', tools: [bhPadRead, bhPadAppend, bhPadReplace, bhPadClear, bhPadCompact] },
  { module: './page/bh-page-observe.ts', tools: [bhPageObserve] },
  { module: './page/bh-page-read-article.ts', tools: [bhPageReadArticle] },
  { module: './page/bh-page-read-visible-text.ts', tools: [bhPageReadVisibleText] },
  { module: './page/bh-page-wait-until-stable.ts', tools: [bhPageWaitUntilStable] },
  { module: './pointer/bh-pointer-click.ts', tools: [bhPointerClick] },
  { module: './shadow/bh-shadow-tools.ts', tools: [bhShadowList, bhShadowQuery] },
  { module: './storage/bh-storage-tools.ts', tools: [bhStorageList, bhStorageGet, bhStorageSetWithApproval, bhStorageDeleteWithApproval, bhStorageClearWithApproval] },
  { module: './tab/bh-tab-tools.ts', tools: [bhTabList, bhTabGetActive, bhTabFocus] },
  { module: './viewport/bh-viewport-get-info.ts', tools: [bhViewportGetInfo] },
  { module: './viewport/bh-viewport-scroll.ts', tools: [bhViewportScroll] },
  { module: './vision/bh-vision-tools.ts', tools: [bhVisionCaptureViewport, bhVisionCaptureFullPage, bhVisionCaptureElement, bhVisionDescribeViewport, bhVisionDetectOverlay, bhVisionDetectLayoutIssues] },
  { module: './workflow/bh-flow-tools.ts', tools: [bhFlowLookup, bhFlowPreview, bhFlowRunWithApproval, bhFlowStep, bhFlowStop, bhFlowSave, bhFlowUpdate, bhFlowDelete, bhFlowScore] }
];
