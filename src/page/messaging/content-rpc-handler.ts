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

type IframeActionKind = 'click' | 'type';
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

const IFRAME_ACTION_TOKEN_TTL_MS = 30_000;
const FORM_ACTION_TOKEN_TTL_MS = 30_000;

export class ContentRpcHandler {
  private refMap: RefMap | undefined;
  private readonly iframeActionGrants = new Map<string, IframeActionGrant>();
  private readonly formActionGrants = new Map<string, FormActionGrant>();
  private locale: Locale;

  constructor(private readonly document: Document, locale: Locale = 'zh') {
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
        const element = this.resolveAnyElement(message.refId);
        if (!element.ok) {
          return element;
        }
        highlightElement(element.element);
        const response = resolveRef(this.ensureRefMap(), message.refId);
        if (!response.ok) {
          return {
            ok: false,
            code: response.code,
            message: response.message
          };
        }
        return {
          ok: true,
          ref: response.element,
          changedPage: false
        };
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
        if (!this.consumeFormActionToken(message.actionToken, 'fill', [message.fieldRefId], undefined, message.runId, message.stepId)) {
          return formActionUnauthorized();
        }
        const fr = fillSingleField(this.document, this.ensureRefMap(), { fieldRefId: message.fieldRefId, value: message.value, clear: message.clear }, this.locale);
        if (fr.status === 'failed') {
          return { ok: false, code: ERROR_CODES.TOOL_EXECUTION_FAILED, message: 'fill field failed' };
        }
        return { ok: true, fillFieldResult: fr } as unknown as ContentRpcResponse;
      }
      case CONTENT_RPC_MESSAGES.FORM_FILL_MANY: {
        if (!this.consumeFormActionToken(message.actionToken, 'fill', message.targets.map((target) => target.fieldRefId), undefined, message.runId, message.stepId)) {
          return formActionUnauthorized();
        }
        const mr = fillManyFields(this.document, this.ensureRefMap(), message.targets, this.locale);
        return { ok: true, fillManyResult: mr } as unknown as ContentRpcResponse;
      }
      case CONTENT_RPC_MESSAGES.FORM_VERIFY: {
        const vm = this.ensureRefMap();
        const fm = new Map<string, HTMLElement>();
        for (const rid of message.fieldRefIds) { const re = vm.resolve(rid); if (re?.element instanceof HTMLElement) fm.set(rid, re.element); }
        if (message.submitRefId) {
          const submit = vm.resolve(message.submitRefId);
          if (submit?.element instanceof HTMLElement) {
            fm.set(message.submitRefId, submit.element);
          }
        }
        return { ok: true, verifyResult: verifyForm(this.document, fm, message.submitRefId, this.locale) } as unknown as ContentRpcResponse;
      }
      case CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT: {
        if (!this.consumeFormActionToken(message.actionToken, 'submit', [], message.submitTargetRefId, message.runId, message.stepId)) {
          return formActionUnauthorized();
        }
        const sr = executeSubmit(this.document, this.ensureRefMap(), message.submitTargetRefId, {
          allowDisabledSubmit: message.allowDisabledSubmit === true
        });
        if (sr === 'submitted') {
          return { ok: true, submitResult: sr } as unknown as ContentRpcResponse;
        }
        return { ok: false, code: ERROR_CODES.TOOL_EXECUTION_FAILED, message: sr };
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
    const now = Date.now();
    for (const [token, grant] of this.iframeActionGrants.entries()) {
      if (grant.expiresAt <= now) {
        this.iframeActionGrants.delete(token);
      }
    }
  }

  private clickIframeTarget(refId: string): ContentRpcResponse {
    const result = this.resolveActionableElement(refId);
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
    const result = this.resolveActionableElement(refId);
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

  private resolveActionableElement(refId: string):
    | {
        ok: true;
        element: Element;
      }
    | {
        ok: false;
        code: string;
        message: string;
      } {
    return this.resolveAnyElement(refId);
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
    const now = Date.now();
    for (const [token, grant] of this.formActionGrants.entries()) {
      if (grant.expiresAt <= now) {
        this.formActionGrants.delete(token);
      }
    }
  }

  private resolveAnyElement(refId: string):
    | {
        ok: true;
        element: Element;
      }
    | {
        ok: false;
        code: string;
        message: string;
      } {
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

function highlightElement(element: Element): void {
  ensureHighlightStyle(element.ownerDocument);
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'auto'
    });
  }
  element.classList.add('bh-page-ref-highlight');
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  ownerWindow.setTimeout(() => {
    element.classList.remove('bh-page-ref-highlight');
  }, 3_000);
}

function ensureHighlightStyle(document: Document): void {
  if (document.getElementById('browserhelm-ref-highlight-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'browserhelm-ref-highlight-style';
  style.textContent = `
    .bh-page-ref-highlight {
      outline: 3px solid #3f8f57 !important;
      outline-offset: 3px !important;
      box-shadow: 0 0 0 7px rgba(127, 186, 114, 0.28) !important;
      scroll-margin: 30vh 30vw !important;
      transition: outline-color 120ms ease, box-shadow 120ms ease !important;
    }
  `;
  document.head?.append(style);
}

type PageReadOptions = {
  cursor?: number | undefined;
  maxChars?: number | undefined;
  source: 'visible_text' | 'article';
  includeHeadings?: boolean | undefined;
  includeLinks?: boolean | undefined;
  linkLimit?: number | undefined;
};

type ScrollAmount = 'half' | 'page' | 'end' | { pixels: number };

const READ_SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template']);

function readPagedDocumentText(document: Document, options: PageReadOptions) {
  const root = options.source === 'article'
    ? findArticleRoot(document)
    : document.body ?? document.documentElement;
  const rawText = collectReadableText(root).replace(/\s+/gu, ' ').trim();
  const cursor = options.cursor ?? 0;
  const maxChars = options.maxChars ?? 8_000;
  const text = rawText.slice(cursor, cursor + maxChars);
  const nextCursor = cursor + text.length < rawText.length ? cursor + text.length : undefined;
  const headings = options.includeHeadings
    ? Array.from(root.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 40).map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: (heading.textContent ?? '').replace(/\s+/gu, ' ').trim()
    })).filter((heading) => heading.text.length > 0)
    : undefined;
  const links = options.includeLinks
    ? Array.from(root.querySelectorAll('a[href]')).slice(0, options.linkLimit ?? 30).map((link) => ({
      text: (link.textContent ?? '').replace(/\s+/gu, ' ').trim(),
      href: (link as HTMLAnchorElement).href
    })).filter((link) => link.text.length > 0 || link.href.length > 0)
    : undefined;

  return {
    text,
    cursor,
    ...(nextCursor === undefined ? {} : { nextCursor }),
    hasMore: nextCursor !== undefined,
    totalTextLength: rawText.length,
    warnings: nextCursor === undefined ? [] : ['VISIBLE_TEXT_TRUNCATED'],
    contentSource: options.source,
    ...(headings === undefined ? {} : { headings }),
    ...(links === undefined ? {} : { links })
  };
}

function findArticleRoot(document: Document): Element {
  return document.querySelector('article, main, [role="main"], .article, .post, .content, #content')
    ?? document.body
    ?? document.documentElement;
}

function collectReadableText(element: Element | null): string {
  if (!element || READ_SKIP_TAGS.has(element.tagName.toLowerCase()) || isElementHidden(element)) {
    return '';
  }
  return Array.from(element.childNodes).map((node) => {
    if (node.nodeType === node.TEXT_NODE) {
      return node.textContent ?? '';
    }
    if (node.nodeType === node.ELEMENT_NODE) {
      return collectReadableText(node as Element);
    }
    return '';
  }).join(' ');
}

function isElementHidden(element: Element): boolean {
  if (element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true') {
    return true;
  }
  const style = element.getAttribute('style')?.toLowerCase() ?? '';
  return style.includes('display: none') || style.includes('visibility: hidden');
}

function isDisabled(element: Element): boolean {
  return element.hasAttribute('disabled') ||
    element.getAttribute('aria-disabled') === 'true';
}

function isSensitiveInput(element: Element): boolean {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }
  const type = element.type.toLowerCase();
  const autocomplete = element.autocomplete.toLowerCase();
  return type === 'password' ||
    autocomplete.includes('password') ||
    /password|token|secret|otp|api.?key/i.test(
      `${element.id} ${element.name} ${element.getAttribute('aria-label') ?? ''}`
    );
}

function writeTextValue(element: Element, text: string): boolean {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLSelectElement) {
    element.value = text;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.textContent = text;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }
  return false;
}

function describeResolvedElement(element: Element, refId: string): Record<string, unknown> {
  return {
    refId,
    role: element.getAttribute('role') ?? inferElementRole(element),
    name: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim(),
    tagName: element.tagName.toLowerCase(),
    visible: !isElementHidden(element),
    disabled: isDisabled(element)
  };
}

function inferElementRole(element: Element): string {
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLSelectElement) return 'combobox';
  return element.tagName.toLowerCase();
}

function readViewportInfo(document: Document) {
  const view = document.defaultView;
  const element = document.scrollingElement ?? document.documentElement;
  const scrollX = view?.scrollX ?? element.scrollLeft;
  const scrollY = view?.scrollY ?? element.scrollTop;
  const viewportWidth = view?.innerWidth ?? element.clientWidth;
  const viewportHeight = view?.innerHeight ?? element.clientHeight;
  const scrollWidth = element.scrollWidth;
  const scrollHeight = element.scrollHeight;
  return {
    scrollX,
    scrollY,
    viewportWidth,
    viewportHeight,
    scrollWidth,
    scrollHeight,
    canScrollDown: scrollY + viewportHeight < scrollHeight - 1,
    canScrollUp: scrollY > 0,
    canScrollLeft: scrollX > 0,
    canScrollRight: scrollX + viewportWidth < scrollWidth - 1,
    atBottom: scrollY + viewportHeight >= scrollHeight - 1,
    atTop: scrollY <= 0
  };
}

function scrollViewport(document: Document, direction: string, amount: ScrollAmount): void {
  const view = document.defaultView;
  const element = document.scrollingElement ?? document.documentElement;
  const viewport = readViewportInfo(document);
  const pixels = typeof amount === 'object'
    ? amount.pixels
    : amount === 'half'
      ? Math.round(viewport.viewportHeight / 2)
      : amount === 'page'
        ? viewport.viewportHeight
        : Number.MAX_SAFE_INTEGER;
  const left = direction === 'left' ? -pixels : direction === 'right' ? pixels : 0;
  const top = direction === 'up' ? -pixels : direction === 'down' ? pixels : 0;
  if (view) {
    view.scrollBy({ left, top, behavior: 'auto' });
    return;
  }
  element.scrollLeft += left;
  element.scrollTop += top;
}

async function waitUntilStable(document: Document, quietMs: number): Promise<ContentRpcResponse> {
  const startedAt = Date.now();
  await new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(finish, quietMs);
    });
    const finish = () => {
      if (timer) {
        clearTimeout(timer);
      }
      observer.disconnect();
      resolve();
    };
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    timer = setTimeout(finish, quietMs);
  });
  const layoutStableFrames = await waitForStableLayoutFrames(document, 2);
  const fontsReady = await waitForFonts(document);
  return {
    ok: true,
    stable: true,
    readyState: document.readyState,
    layoutStableFrames,
    fontsReady,
    networkIdle: 'unavailable',
    waitedMs: Date.now() - startedAt
  };
}

async function waitForStableLayoutFrames(document: Document, targetFrames: number): Promise<number> {
  let stableFrames = 0;
  let previous = layoutSignature(document);
  for (let index = 0; index < targetFrames * 3 && stableFrames < targetFrames; index += 1) {
    await nextAnimationFrame(document);
    const current = layoutSignature(document);
    if (current === previous) {
      stableFrames += 1;
    } else {
      stableFrames = 0;
      previous = current;
    }
  }
  return stableFrames;
}

function layoutSignature(document: Document): string {
  const element = document.scrollingElement ?? document.documentElement;
  const bodyRect = document.body?.getBoundingClientRect();
  return [
    element.scrollWidth,
    element.scrollHeight,
    element.clientWidth,
    element.clientHeight,
    bodyRect ? Math.round(bodyRect.width) : 0,
    bodyRect ? Math.round(bodyRect.height) : 0
  ].join(':');
}

function nextAnimationFrame(document: Document): Promise<void> {
  const view = document.defaultView;
  return new Promise((resolve) => {
    if (view?.requestAnimationFrame) {
      view.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 16);
  });
}

async function waitForFonts(document: Document): Promise<boolean> {
  const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (typeof fonts?.ready?.then !== 'function') {
    return false;
  }
  await Promise.race([
    fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 250))
  ]);
  return true;
}

function formActionUnauthorized(): ContentRpcResponse {
  return {
    ok: false,
    code: ERROR_CODES.FORM_ACTION_UNAUTHORIZED,
    message: 'Form mutations must be routed through the runtime tool boundary'
  };
}

function iframeActionUnauthorized(): ContentRpcResponse {
  return {
    ok: false,
    code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED,
    message: 'Iframe mutations must be routed through the runtime tool boundary'
  };
}

function createOpaqueToken(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `${prefix}_${cryptoObject.randomUUID()}`;
  }
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}
