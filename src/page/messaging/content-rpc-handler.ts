import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { isVisibleElement } from '../a11y/element-finder';
import type { ElementRef } from '../../shared/schemas/observation.schema';
import type { Locale } from '../../i18n/types';
import { resolveRef } from '../a11y/ref-resolver';
import { buildObservation } from '../observe/build-observation';
import {
  fillSingleField,
  fillManyFields,
  verifyForm,
  executeSubmit,
  setFieldText,
  type FillFieldResult
} from '../dom/form-fill-dom';
import { readFormFields } from '../dom/form-reader';
import { readPageMetadata } from '../observe/page-metadata';
import type { FormFieldSnapshot } from '../../shared/schemas/structured-page-data.schema';
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
import { redactTextForModelContext } from '../../shared/redaction';
import type {
  StorageArea,
  StorageEntrySummary,
  StorageGetResult,
  StorageListResult,
  StorageMutationResult
} from '../../shared/schemas/storage';
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
  formRefId?: string | undefined;
  submitTargetRefId?: string | undefined;
  frameId: number;
  origin: string;
  documentId: string;
  createdAt: number;
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
  private readonly consumedFormActionTokens = new Set<string>();
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
      case CONTENT_RPC_MESSAGES.STORAGE_LIST: {
        return {
          ok: true,
          storageList: this.readStorageList(message.area, message.limit)
        };
      }
      case CONTENT_RPC_MESSAGES.STORAGE_GET: {
        return {
          ok: true,
          storageGet: this.readStorageEntry(message.area, message.key)
        };
      }
      case CONTENT_RPC_MESSAGES.STORAGE_SET: {
        return {
          ok: true,
          storageMutation: this.setStorageEntry(message.area, message.key, message.value)
        };
      }
      case CONTENT_RPC_MESSAGES.STORAGE_DELETE: {
        return {
          ok: true,
          storageMutation: this.deleteStorageEntry(message.area, message.key)
        };
      }
      case CONTENT_RPC_MESSAGES.STORAGE_CLEAR: {
        return {
          ok: true,
          storageMutation: this.clearStorageArea(message.area)
        };
      }
      // form fill actions
      case CONTENT_RPC_MESSAGES.FORM_ACTION_AUTHORIZE: {
        return {
          ok: true,
          actionToken: this.createFormActionToken(
            message.action,
            message.fieldRefIds ?? [],
            message.formRefId,
            message.submitTargetRefId,
            message.frameId ?? 0,
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

  private readStorageList(area: StorageArea, limit = 50): StorageListResult {
    const storage = this.storageForArea(area);
    const keys = Array.from({ length: storage.length }, (_unused, index) => storage.key(index))
      .filter((key): key is string => typeof key === 'string')
      .sort((left, right) => left.localeCompare(right));
    const entries = keys.slice(0, limit).map((key) => this.summarizeStorageEntry(area, key, storage.getItem(key)));
    return {
      area,
      count: keys.length,
      entries,
      ...(keys.length > entries.length ? { omittedCount: keys.length - entries.length } : {})
    };
  }

  private readStorageEntry(area: StorageArea, key: string): StorageGetResult {
    const storage = this.storageForArea(area);
    const value = storage.getItem(key);
    return {
      area,
      key,
      found: value !== null,
      ...(value !== null ? { entry: this.summarizeStorageEntry(area, key, value) } : {})
    };
  }

  private setStorageEntry(area: StorageArea, key: string, value: string): StorageMutationResult {
    const storage = this.storageForArea(area);
    const previous = storage.getItem(key);
    storage.setItem(key, value);
    return {
      area,
      operation: 'set',
      key,
      changed: previous !== value,
      valueLength: value.length
    };
  }

  private deleteStorageEntry(area: StorageArea, key: string): StorageMutationResult {
    const storage = this.storageForArea(area);
    const existed = storage.getItem(key) !== null;
    storage.removeItem(key);
    return {
      area,
      operation: 'delete',
      key,
      changed: existed,
      affectedCount: existed ? 1 : 0
    };
  }

  private clearStorageArea(area: StorageArea): StorageMutationResult {
    const storage = this.storageForArea(area);
    const affectedCount = storage.length;
    storage.clear();
    return {
      area,
      operation: 'clear',
      changed: affectedCount > 0,
      affectedCount
    };
  }

  private storageForArea(area: StorageArea): Storage {
    const view = this.document.defaultView;
    if (!view) {
      throw new Error('Window storage is unavailable');
    }
    return area === 'localStorage' ? view.localStorage : view.sessionStorage;
  }

  private summarizeStorageEntry(area: StorageArea, key: string, value: string | null): StorageEntrySummary {
    const rawValue = value ?? '';
    const sensitive = isSensitiveStorageKey(key);
    const preview = sensitive
      ? undefined
      : redactTextForModelContext(rawValue).slice(0, 160);
    return {
      area,
      key,
      ...(preview ? { valuePreview: preview } : {}),
      valueLength: rawValue.length,
      masked: sensitive,
      ...(sensitive ? { reason: 'sensitive_storage_key' } : {})
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
    if (!this.consumeFormActionToken(
      message.actionToken,
      'fill',
      [message.fieldRefId],
      undefined,
      undefined,
      message.frameId ?? 0,
      message.runId,
      message.stepId
    )) {
      return formActionUnauthorized();
    }
    const fieldRefId = this.resolveFreshFormFillRefId(message.fieldRefId);
    const fillResult = fillSingleField(
      this.document,
      this.ensureRefMap(),
      {
        fieldRefId,
        value: message.value,
        clear: message.clear,
        allowSingleFieldFallback: true
      },
      this.locale
    );
    if (fillResult.status === 'failed') {
      const errorMessage = fillResult.error ?? fillResult.skipReason ?? 'fill field failed';
      if (isRefStaleFillError(errorMessage)) {
        const completedResult = this.readCompletedLiveSearchField(message.fieldRefId, message.value);
        if (completedResult) {
          return {
            ok: true,
            fillFieldResult: completedResult
          } satisfies FillFieldResponse;
        }
        const fallbackResult =
          this.fillCurrentSingleFormFieldFallback(message.fieldRefId, message.value, message.clear) ??
          this.fillLiveSearchFieldFallback(message.fieldRefId, message.value, message.clear);
        if (fallbackResult) {
          return {
            ok: true,
            fillFieldResult: fallbackResult
          } satisfies FillFieldResponse;
        }
      }
      return {
        ok: false,
        code: isRefStaleFillError(errorMessage)
          ? ERROR_CODES.REF_STALE
          : ERROR_CODES.TOOL_EXECUTION_FAILED,
        message: errorMessage
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
    if (!this.consumeFormActionToken(
      message.actionToken,
      'fill',
      message.targets.map((target) => target.fieldRefId),
      undefined,
      undefined,
      message.frameId ?? 0,
      message.runId,
      message.stepId
    )) {
      return formActionUnauthorized();
    }
    const targets = message.targets.map((target) => ({
      ...target,
      fieldRefId: this.resolveFreshFormFillRefId(target.fieldRefId),
      allowSingleFieldFallback: message.targets.length === 1
    }));
    const refMap = this.ensureRefMap();
    const fillManyResult = fillManyFields(
      this.document,
      refMap,
      targets,
      this.locale
    );
    return {
      ok: true,
      fillManyResult: {
        ...fillManyResult,
        updatedFields: readFormFields(this.document, refMap, this.locale).fields
          .map(redactUpdatedFormField)
      }
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
    const grant = this.consumeFormActionToken(
      message.actionToken,
      'submit',
      [],
      message.formRefId,
      message.submitTargetRefId,
      message.frameId ?? 0,
      message.runId,
      message.stepId
    );
    if (!grant) {
      return formActionUnauthorized();
    }
    const submitResult = executeSubmit(
      this.document,
      this.ensureRefMap(),
      message.submitTargetRefId,
      {
        allowDisabledSubmit: message.allowDisabledSubmit === true,
        formRefId: message.formRefId,
        fieldRefIds: Array.from(grant.fieldRefIds)
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

  private readCompletedLiveSearchField(
    fieldRefId: string,
    value: string
  ): FillFieldResult | undefined {
    const element = this.findLiveSearchField((candidate) => candidate.value === value);
    return element
      ? this.liveSearchFieldResult(fieldRefId, value, element, true)
      : undefined;
  }

  private fillLiveSearchFieldFallback(
    fieldRefId: string,
    value: string,
    clear: boolean | undefined
  ): FillFieldResult | undefined {
    const element = this.findLiveSearchField();
    if (!element) {
      return undefined;
    }
    const nextValue = clear === true && value.length === 0 ? '' : value;
    setFieldText(element, nextValue);
    return this.liveSearchFieldResult(fieldRefId, value, element, nextValue.length > 0);
  }

  private fillCurrentSingleFormFieldFallback(
    originalFieldRefId: string,
    value: string,
    clear: boolean | undefined
  ): FillFieldResult | undefined {
    const observation = buildObservation(this.document, {
      refMap: this.ensureRefMap(true),
      locale: this.locale
    });
    const fields = readObservationFields(observation.formFields);
    if (fields.length !== 1) {
      return undefined;
    }
    const result = fillSingleField(
      this.document,
      this.ensureRefMap(),
      {
        fieldRefId: fields[0]!.refId,
        value,
        clear,
        allowSingleFieldFallback: true
      },
      this.locale
    );
    return result.status === 'failed'
      ? undefined
      : {
          ...result,
          fieldRefId: originalFieldRefId,
          retried: true
        };
  }

  private findLiveSearchField(
    predicate: (candidate: HTMLInputElement) => boolean = () => true
  ): HTMLInputElement | undefined {
    const activeElement = this.document.activeElement instanceof HTMLInputElement
      ? this.document.activeElement
      : undefined;
    const candidates = [
      ...Array.from(
        this.document.querySelectorAll<HTMLInputElement>('input[name="search_query"], input[type="search"], input#search')
      ),
      ...(activeElement ? [activeElement] : [])
    ];
    return candidates.find((candidate) =>
      predicate(candidate) && isSafeLiveSearchFallback(candidate)
    );
  }

  private liveSearchFieldResult(
    fieldRefId: string,
    requestedValue: string,
    element: HTMLInputElement,
    filled: boolean
  ): FillFieldResult {
    return {
      fieldRefId,
      label: element.getAttribute('aria-label') ?? element.getAttribute('placeholder') ?? undefined,
      name: element.getAttribute('name') ?? undefined,
      type: element.getAttribute('type')?.toLowerCase() || 'text',
      status: filled ? 'filled' : 'cleared',
      requestedValue,
      actualValuePreview: element.value.trim() ? 'non-empty' : 'empty',
      maskedActualValue: '[MASKED]',
      retried: true,
      changedPage: true
    };
  }

  private createFormActionToken(
    action: FormActionKind,
    fieldRefIds: string[],
    formRefId: string | undefined,
    submitTargetRefId: string | undefined,
    frameId: number,
    runId: string,
    stepId: string
  ): string {
    this.pruneExpiredFormActionTokens();
    const now = Date.now();
    const metadata = readPageMetadata(this.document);
    const grant = {
      action,
      fieldRefIds: new Set(fieldRefIds),
      formRefId,
      submitTargetRefId,
      frameId,
      origin: metadata.origin,
      documentId: metadata.url,
      createdAt: now,
      expiresAt: now + FORM_ACTION_TOKEN_TTL_MS,
      runId,
      stepId
    };
    const token = encodeFormActionToken();
    this.formActionGrants.set(token, grant);
    return token;
  }

  private consumeFormActionToken(
    token: string | undefined,
    action: FormActionKind,
    fieldRefIds: string[],
    formRefId: string | undefined,
    submitTargetRefId: string | undefined,
    frameId: number,
    runId: string,
    stepId: string
  ): FormActionGrant | undefined {
    this.pruneExpiredFormActionTokens();
    if (!token) {
      return undefined;
    }
    const grant = this.formActionGrants.get(token);
    this.formActionGrants.delete(token);
    if (this.consumedFormActionTokens.has(token)) {
      return undefined;
    }
    const resolvedGrant = grant;
    if (!resolvedGrant || resolvedGrant.action !== action || resolvedGrant.expiresAt <= Date.now()) {
      return undefined;
    }
    if (resolvedGrant.runId !== runId) {
      return undefined;
    }
    if (resolvedGrant.stepId !== stepId) {
      return undefined;
    }
    if (resolvedGrant.frameId !== frameId) {
      return undefined;
    }
    const metadata = readPageMetadata(this.document);
    if (resolvedGrant.origin !== metadata.origin || resolvedGrant.documentId !== metadata.url) {
      return undefined;
    }
    this.consumedFormActionTokens.add(token);
    if (action === 'fill') {
      return fieldRefIds.every((refId) => resolvedGrant.fieldRefIds.has(refId))
        ? resolvedGrant
        : undefined;
    }
    if (!resolvedGrant.submitTargetRefId && !resolvedGrant.formRefId) {
      return undefined;
    }
    if (resolvedGrant.submitTargetRefId) {
      return resolvedGrant.submitTargetRefId === submitTargetRefId ? resolvedGrant : undefined;
    }
    return resolvedGrant.formRefId === formRefId ? resolvedGrant : undefined;
  }

  private pruneExpiredFormActionTokens(): void {
    pruneExpiredGrants(this.formActionGrants);
  }

  private resolveFreshFormFillRefId(refId: string): string {
    const refMap = this.ensureRefMap();
    const entry = refMap.resolve(refId);
    if (entry && !refMap.isEntryStale(entry)) {
      return refId;
    }
    const previousSummary = entry?.summary;
    const observation = buildObservation(this.document, {
      refMap: this.ensureRefMap(true),
      locale: this.locale
    });
    const refreshedFields = readObservationFields(observation.formFields);
    const matched = refreshedFields.find((field) =>
      field.refId !== refId && formFieldMatchesSummary(field, previousSummary)
    );
    if (matched) {
      return matched.refId;
    }
    if (refreshedFields.length === 1) {
      return refreshedFields[0]!.refId;
    }
    if (previousSummary) {
      buildObservation(this.document, {
        refMap: this.ensureRefMap(true),
        locale: this.locale
      });
    }
    return refId;
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

function isSensitiveStorageKey(key: string): boolean {
  return /api.?key|auth|bearer|credential|jwt|password|secret|session|token|csrf|xsrf|otp|code|email|phone/iu.test(key);
}

type ObservationFormField = {
  refId: string;
  label?: string | undefined;
  name?: string | undefined;
  type?: string | undefined;
};

function readObservationFields(value: unknown): ObservationFormField[] {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return [];
  }
  return value.fields.flatMap((field): ObservationFormField[] => {
    if (!isRecord(field) || typeof field.refId !== 'string') {
      return [];
    }
    return [{
      refId: field.refId,
      label: optionalString(field.label),
      name: optionalString(field.name),
      type: optionalString(field.type)
    }];
  });
}

function formFieldMatchesSummary(
  field: ObservationFormField,
  previousSummary: ElementRef | undefined
): boolean {
  if (!previousSummary) {
    return false;
  }
  const previousName = normalizeComparableText(previousSummary.name);
  const fieldLabel = normalizeComparableText(field.label);
  const fieldName = normalizeComparableText(field.name);
  if (previousName && (previousName === fieldLabel || previousName === fieldName)) {
    return true;
  }
  const previousRole = normalizeComparableText(previousSummary.role);
  const fieldType = normalizeComparableText(field.type);
  return previousSummary.tagName === 'input' &&
    (previousRole === 'searchbox' || previousRole === 'combobox') &&
    (fieldType === 'search' || fieldType === 'text');
}

function redactUpdatedFormField(field: FormFieldSnapshot): FormFieldSnapshot {
  if (!field.writable) {
    return field;
  }
  const writable = { ...field.writable };
  delete writable.actualValue;
  return {
    ...field,
    writable
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeComparableText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : undefined;
}

function isRefStaleFillError(message: string): boolean {
  return message === 'Ref is stale' || message === 'Ref 已失效';
}

function isSafeLiveSearchFallback(element: HTMLInputElement): boolean {
  const inputType = (element.getAttribute('type') ?? 'text').toLowerCase();
  const haystack = [
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    element.getAttribute('role'),
    inputType
  ].join(' ').toLowerCase();
  return element.isConnected &&
    !isDisabled(element) &&
    element.readOnly !== true &&
    !isSensitiveInput(element) &&
    ['text', 'search', 'email', 'url', 'tel', 'number'].includes(inputType) &&
    /search|query|(?:^|\s)q(?:\s|$)|搜索|搜尋/u.test(haystack) &&
    (element.getAttribute('name') === 'search_query' || hasVisibleGeometry(element));
}

function hasVisibleGeometry(element: HTMLElement): boolean {
  if (isVisibleElement(element)) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function encodeFormActionToken(): string {
  return createOpaqueToken('bh_form');
}
