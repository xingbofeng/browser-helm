import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import type { Locale } from '../../i18n/types';
import { resolveRef } from '../a11y/ref-resolver';
import { buildObservation } from '../observe/build-observation';
import { fillSingleField, fillManyFields, verifyForm, executeSubmit } from '../dom/form-fill-dom';
import { readPageMetadata } from '../observe/page-metadata';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import {
  contentRpcRequestSchema,
  type ContentRpcRequest,
  type ContentRpcResponse
} from './content-rpc.schema';
import { readPagedDocumentText } from './page-read-dom';
import {
  readViewportInfo,
  scrollViewport,
  waitUntilStable
} from './viewport-dom';
import { listShadowRoots, queryShadowRoot } from '../shadow/shadow-dom';
import {
  createOpaqueToken,
  describeResolvedElement,
  formActionUnauthorized,
  highlightElement,
  iframeActionUnauthorized,
  isDisabled,
  isSensitiveInput,
  writeTextValue
} from './element-action-dom';

type IframeActionKind = 'click' | 'type';
type ResolvedElementResult =
  | {
      ok: true;
      element: Element;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };
type IframeActionGrant = {
  action: IframeActionKind;
  refId: string;
  expiresAt: number;
};
type FormActionKind = 'fill' | 'submit';
type FormActionGrant = {
  action: FormActionKind;
  fieldRefIds: Set<string>;
  submitTargetRefId?: string | undefined;
  expiresAt: number;
  runId: string;
  stepId: string;
};
type FillFieldResponse = Extract<ContentRpcResponse, { ok: true; fillFieldResult: unknown }>;
type FillManyResponse = Extract<ContentRpcResponse, { ok: true; fillManyResult: unknown }>;
type VerifyResponse = Extract<ContentRpcResponse, { ok: true; verifyResult: unknown }>;
type SubmitResponse = Extract<ContentRpcResponse, { ok: true; submitResult: unknown }>;

const IFRAME_ACTION_TOKEN_TTL_MS = 30_000;
const FORM_ACTION_TOKEN_TTL_MS = 30_000;

export class ContentRpcHandler {
  private refMap: RefMap | undefined;
  private readonly iframeActionGrants = new Map<string, IframeActionGrant>();
  private readonly formActionGrants = new Map<string, FormActionGrant>();
  private locale: Locale;

  constructor(
    private readonly document: Document,
    locale: Locale = 'zh',
    private readonly enablePageHealthBridge?: (() => void) | undefined
  ) {
    this.locale = locale;
  }

  /** Updates the locale used for user-visible messages and observation. */
  updateLocale(locale: Locale): void {
    this.locale = locale;
  }
  handle<T extends ContentRpcRequest>(
    rawMessage: T
  ): T extends { type: typeof CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE }
    ? Promise<ContentRpcResponse>
    : ContentRpcResponse;
  handle(rawMessage: unknown): ContentRpcResponse | Promise<ContentRpcResponse>;
  handle(rawMessage: unknown): ContentRpcResponse | Promise<ContentRpcResponse> {
    const parsed = contentRpcRequestSchema.safeParse(rawMessage);
    if (!parsed.success) {
      return {
        ok: false,
        code: ERROR_CODES.OBSERVATION_FAILED,
        message: 'Invalid content RPC request',
        detail: parsed.error.issues
      };
    }

    try {
      return this.handleParsed(parsed.data);
    } catch (error) {
      return {
        ok: false,
        code: ERROR_CODES.OBSERVATION_FAILED,
        message: error instanceof Error ? error.message : 'Observation failed'
      };
    }
  }

  private handleParsed(message: ContentRpcRequest): ContentRpcResponse | Promise<ContentRpcResponse> {
    switch (message.type) {
      case CONTENT_RPC_MESSAGES.PAGE_HEALTH_ENABLE: {
        this.enablePageHealthBridge?.();
        return {
          ok: true,
          enabled: true,
          summary: 'Temporary shallow page-health hook enabled for Debug mode.'
        };
      }
      case CONTENT_RPC_MESSAGES.PAGE_OBSERVE: {
        const refMap = this.ensureRefMap(true);
        return {
          ok: true,
          observation: buildObservation(this.document, { refMap, locale: this.locale })
        };
      }
      case CONTENT_RPC_MESSAGES.PAGE_READ_VISIBLE_TEXT: {
        return {
          ok: true,
          pageRead: readPagedDocumentText(this.document, {
            cursor: message.cursor,
            maxChars: message.maxChars,
            source: 'visible_text'
          })
        };
      }
      case CONTENT_RPC_MESSAGES.PAGE_READ_ARTICLE: {
        return {
          ok: true,
          pageRead: readPagedDocumentText(this.document, {
            cursor: message.cursor,
            maxChars: message.maxChars,
            source: 'article',
            includeHeadings: message.includeHeadings,
            includeLinks: message.includeLinks,
            linkLimit: message.linkLimit
          })
        };
      }
      case CONTENT_RPC_MESSAGES.PAGE_WAIT_UNTIL_STABLE: {
        return waitUntilStable(this.document, message.quietMs ?? 250);
      }
      case CONTENT_RPC_MESSAGES.VIEWPORT_GET_INFO: {
        return {
          ok: true,
          viewport: readViewportInfo(this.document)
        };
      }
      case CONTENT_RPC_MESSAGES.VIEWPORT_SCROLL: {
        const before = readViewportInfo(this.document);
        scrollViewport(this.document, message.direction, message.amount);
        const after = readViewportInfo(this.document);
        return {
          ok: true,
          viewport: after,
          before,
          after,
          didScroll: before.scrollX !== after.scrollX || before.scrollY !== after.scrollY,
          atBoundary: before.scrollX === after.scrollX && before.scrollY === after.scrollY
        };
      }
      case CONTENT_RPC_MESSAGES.FRAME_LIST: {
        return {
          ok: false,
          code: ERROR_CODES.OBSERVATION_FAILED,
          message: 'Frame list is only available from the background runtime'
        };
      }
      case CONTENT_RPC_MESSAGES.A11Y_SNAPSHOT: {
        return {
          ok: true,
          snapshot: buildA11ySnapshot(this.document, this.ensureRefMap())
        };
      }
      case CONTENT_RPC_MESSAGES.A11Y_RESOLVE_REF: {
        const result = resolveRef(this.ensureRefMap(), message.refId);
        if (!result.ok) {
          return {
            ok: false,
            code: result.code,
            message: result.message
          };
        }
        return {
          ok: true,
          ref: result.element
        };
      }
      case CONTENT_RPC_MESSAGES.A11Y_HIGHLIGHT_REF: {
        return this.highlightRef(message.refId);
      }
      case CONTENT_RPC_MESSAGES.A11Y_REFRESH_REFS: {
        const refMap = this.ensureRefMap(true);
        return {
          ok: true,
          snapshot: buildA11ySnapshot(this.document, refMap)
        };
      }
      case CONTENT_RPC_MESSAGES.IFRAME_READ: {
        return this.readIframeTarget(message.refId);
      }
      case CONTENT_RPC_MESSAGES.IFRAME_ACTION_AUTHORIZE: {
        return {
          ok: true,
          actionToken: this.createIframeActionToken(message.action, message.refId)
        };
      }
      case CONTENT_RPC_MESSAGES.IFRAME_CLICK: {
        if (!this.consumeIframeActionToken(message.actionToken, 'click', message.refId)) {
          return iframeActionUnauthorized();
        }
        return this.clickIframeTarget(message.refId);
      }
      case CONTENT_RPC_MESSAGES.IFRAME_TYPE: {
        if (!this.consumeIframeActionToken(message.actionToken, 'type', message.refId)) {
          return iframeActionUnauthorized();
        }
        return this.typeIframeTarget(message.refId, message.text);
      }
      case CONTENT_RPC_MESSAGES.SHADOW_LIST: {
        return {
          ok: true,
          shadowRoots: listShadowRoots(this.document)
        };
      }
      case CONTENT_RPC_MESSAGES.SHADOW_QUERY: {
        return {
          ok: true,
          shadowQuery: queryShadowRoot(this.document, {
            hostSelector: message.hostSelector,
            selector: message.selector
          })
        };
      }
      // form fill actions
      case CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE: {
        return {
          ok: true,
          actionToken: this.createFormActionToken(
            message.action,
            message.fieldRefIds ?? [],
            message.submitTargetRefId,
            message.runId,
            message.stepId
          )
        };
      }
      case CONTENT_RPC_MESSAGES.FORM_FILL_FIELD: {
        return this.handleFormFillField(message);
      }
      case CONTENT_RPC_MESSAGES.FORM_FILL_MANY: {
        return this.handleFormFillMany(message);
      }
      case CONTENT_RPC_MESSAGES.FORM_VERIFY: {
        return this.handleFormVerify(message);
      }
      case CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT: {
        return this.handleFormExecuteSubmit(message);
      }
    }
  }

  private readIframeTarget(refId: string): ContentRpcResponse {
    const result = resolveRef(this.ensureRefMap(), refId);
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message
      };
    }
    return {
      ok: true,
      ref: result.element,
      changedPage: false
    };
  }

  private highlightRef(refId: string): ContentRpcResponse {
    const resolved = this.resolveAnyElement(refId);
    if (!resolved.ok) {
      return resolved;
    }
    highlightElement(resolved.element);
    return this.readIframeTarget(refId);
  }

  private createIframeActionToken(action: IframeActionKind, refId: string): string {
    this.pruneExpiredIframeActionTokens();
    const token = createOpaqueToken('bh_iframe');
    this.iframeActionGrants.set(token, {
      action,
      refId,
      expiresAt: Date.now() + IFRAME_ACTION_TOKEN_TTL_MS
    });
    return token;
  }

  private consumeIframeActionToken(
    token: string | undefined,
    action: IframeActionKind,
    refId: string
  ): boolean {
    this.pruneExpiredIframeActionTokens();
    if (!token) {
      return false;
    }
    const grant = this.iframeActionGrants.get(token);
    if (!grant || grant.action !== action || grant.refId !== refId || grant.expiresAt <= Date.now()) {
      return false;
    }
    this.iframeActionGrants.delete(token);
    return true;
  }

  private pruneExpiredIframeActionTokens(): void {
    pruneExpiredGrants(this.iframeActionGrants);
  }

  private clickIframeTarget(refId: string): ContentRpcResponse {
    const result = this.resolveAnyElement(refId);
    if (!result.ok) {
      return result;
    }
    if (isDisabled(result.element)) {
      return {
        ok: false,
        code: ERROR_CODES.ELEMENT_DISABLED,
        message: `Element is disabled: ${refId}`
      };
    }
    if (typeof (result.element as HTMLElement).click !== 'function') {
      return {
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_ACTIONABLE,
        message: `Element is not clickable: ${refId}`
      };
    }
    (result.element as HTMLElement).click();
    return {
      ok: true,
      ref: describeResolvedElement(result.element, refId),
      changedPage: true
    };
  }

  private typeIframeTarget(refId: string, text: string): ContentRpcResponse {
    const result = this.resolveAnyElement(refId);
    if (!result.ok) {
      return result;
    }
    if (isDisabled(result.element)) {
      return {
        ok: false,
        code: ERROR_CODES.ELEMENT_DISABLED,
        message: `Element is disabled: ${refId}`
      };
    }
    if (isSensitiveInput(result.element)) {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        message: `Sensitive iframe input still requires approval: ${refId}`
      };
    }
    if (!writeTextValue(result.element, text)) {
      return {
        ok: false,
        code: ERROR_CODES.ELEMENT_NOT_ACTIONABLE,
        message: `Element is not text-editable: ${refId}`
      };
    }
    return {
      ok: true,
      ref: describeResolvedElement(result.element, refId),
      changedPage: true
    };
  }

  private handleFormFillField(
    message: Extract<ContentRpcRequest, { type: typeof CONTENT_RPC_MESSAGES.FORM_FILL_FIELD }>
  ): ContentRpcResponse {
    if (
      !this.consumeFormActionToken(
        message.actionToken,
        'fill',
        [message.fieldRefId],
        undefined,
        message.runId,
        message.stepId
      )
    ) {
      return formActionUnauthorized();
    }
    const fillResult = fillSingleField(
      this.document,
      this.ensureRefMap(),
      {
        fieldRefId: message.fieldRefId,
        value: message.value,
        clear: message.clear
      },
      this.locale
    );
    if (fillResult.status === 'failed') {
      return {
        ok: false,
        code: ERROR_CODES.TOOL_EXECUTION_FAILED,
        message: 'fill field failed'
      };
    }
    return {
      ok: true,
      fillFieldResult: fillResult
    } satisfies FillFieldResponse;
  }

  private handleFormFillMany(
    message: Extract<ContentRpcRequest, { type: typeof CONTENT_RPC_MESSAGES.FORM_FILL_MANY }>
  ): ContentRpcResponse {
    if (
      !this.consumeFormActionToken(
        message.actionToken,
        'fill',
        message.targets.map((target) => target.fieldRefId),
        undefined,
        message.runId,
        message.stepId
      )
    ) {
      return formActionUnauthorized();
    }
    return {
      ok: true,
      fillManyResult: fillManyFields(
        this.document,
        this.ensureRefMap(),
        message.targets,
        this.locale
      )
    } satisfies FillManyResponse;
  }

  private handleFormVerify(
    message: Extract<ContentRpcRequest, { type: typeof CONTENT_RPC_MESSAGES.FORM_VERIFY }>
  ): ContentRpcResponse {
    return {
      ok: true,
      verifyResult: verifyForm(
        this.document,
        this.resolveVerifyElements(message.fieldRefIds, message.submitRefId),
        message.submitRefId,
        this.locale
      )
    } satisfies VerifyResponse;
  }

  private handleFormExecuteSubmit(
    message: Extract<ContentRpcRequest, { type: typeof CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT }>
  ): ContentRpcResponse {
    if (
      !this.consumeFormActionToken(
        message.actionToken,
        'submit',
        [],
        message.submitTargetRefId,
        message.runId,
        message.stepId
      )
    ) {
      return formActionUnauthorized();
    }
    const submitResult = executeSubmit(
      this.document,
      this.ensureRefMap(),
      message.submitTargetRefId,
      {
        allowDisabledSubmit: message.allowDisabledSubmit === true
      }
    );
    if (submitResult !== 'submitted') {
      return {
        ok: false,
        code: ERROR_CODES.TOOL_EXECUTION_FAILED,
        message: submitResult
      };
    }
    return {
      ok: true,
      submitResult
    } satisfies SubmitResponse;
  }

  private resolveVerifyElements(
    fieldRefIds: string[],
    submitRefId?: string
  ): Map<string, HTMLElement> {
    const refMap = this.ensureRefMap();
    const elements = new Map<string, HTMLElement>();
    for (const refId of fieldRefIds) {
      const resolved = refMap.resolve(refId);
      if (resolved?.element instanceof HTMLElement) {
        elements.set(refId, resolved.element);
      }
    }
    if (submitRefId) {
      const submit = refMap.resolve(submitRefId);
      if (submit?.element instanceof HTMLElement) {
        elements.set(submitRefId, submit.element);
      }
    }
    return elements;
  }

  private createFormActionToken(
    action: FormActionKind,
    fieldRefIds: string[],
    submitTargetRefId: string | undefined,
    runId: string,
    stepId: string
  ): string {
    this.pruneExpiredFormActionTokens();
    const token = createOpaqueToken('bh_form');
    this.formActionGrants.set(token, {
      action,
      fieldRefIds: new Set(fieldRefIds),
      submitTargetRefId,
      expiresAt: Date.now() + FORM_ACTION_TOKEN_TTL_MS,
      runId,
      stepId
    });
    return token;
  }

  private consumeFormActionToken(
    token: string | undefined,
    action: FormActionKind,
    fieldRefIds: string[],
    submitTargetRefId: string | undefined,
    runId: string,
    stepId: string
  ): boolean {
    this.pruneExpiredFormActionTokens();
    if (!token) {
      return false;
    }
    const grant = this.formActionGrants.get(token);
    this.formActionGrants.delete(token);
    if (!grant || grant.action !== action || grant.expiresAt <= Date.now()) {
      return false;
    }
    if (grant.runId !== runId) {
      return false;
    }
    if (grant.stepId !== stepId) {
      return false;
    }
    if (action === 'fill') {
      return fieldRefIds.every((refId) => grant.fieldRefIds.has(refId));
    }
    return grant.submitTargetRefId === submitTargetRefId;
  }

  private pruneExpiredFormActionTokens(): void {
    pruneExpiredGrants(this.formActionGrants);
  }

  private resolveAnyElement(refId: string): ResolvedElementResult {
    const refMap = this.ensureRefMap();
    const result = resolveRef(refMap, refId);
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message
      };
    }
    const entry = refMap.resolve(refId);
    if (entry?.element && !refMap.isEntryStale(entry)) {
      return {
        ok: true,
        element: entry.element
      };
    }
    return {
      ok: false,
      code: ERROR_CODES.REF_STALE,
      message: `Ref is stale: ${refId}`
    };
  }

  private ensureRefMap(reset = false): RefMap {
    const metadata = readPageMetadata(this.document);
    if (!this.refMap || reset) {
      this.refMap = new RefMap({
        documentId: metadata.url,
        origin: metadata.origin
      });
    } else {
      this.refMap.updateScope({
        documentId: metadata.url,
        origin: metadata.origin
      });
    }
    return this.refMap;
  }
}

function pruneExpiredGrants<T extends { expiresAt: number }>(grants: Map<string, T>): void {
  const now = Date.now();
  for (const [token, grant] of grants.entries()) {
    if (grant.expiresAt <= now) {
      grants.delete(token);
    }
  }
}
