import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { resolveRef, type ResolvedRefElement } from '../a11y/ref-resolver';
import { checkResolvedActionReadiness } from '../dom/action-readiness';
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

const IFRAME_ACTION_TOKEN_TTL_MS = 30_000;

export class ContentRpcHandler {
  private refMap: RefMap | undefined;
  private readonly iframeActionGrants = new Map<string, IframeActionGrant>();

  constructor(private readonly document: Document) {}

  handle(rawMessage: unknown): ContentRpcResponse {
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

  private handleParsed(message: ContentRpcRequest): ContentRpcResponse {
    switch (message.type) {
      case CONTENT_RPC_MESSAGES.PAGE_OBSERVE: {
        const refMap = this.ensureRefMap(true);
        return {
          ok: true,
          observation: buildObservation(this.document, { refMap })
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
        return {
          ok: true,
          stable: true,
          readyState: this.document.readyState,
          waitedMs: 0
        };
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
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
        }
        return {
          ok: true,
          actionToken: this.createIframeActionToken(message.refId, message.action)
        };
      }
      case CONTENT_RPC_MESSAGES.IFRAME_CLICK: {
        const unauthorized = this.validateIframeActionToken(message.actionToken, {
          action: 'click',
          refId: message.refId
        });
        if (unauthorized) {
          return unauthorized;
        }
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
        }
        const readiness = checkResolvedActionReadiness(
          {
            kind: 'click',
            refId: message.refId,
            source: 'runtime'
          },
          response.ref as ResolvedRefElement
        );
        const blocked = this.blockedIframeReadiness(readiness);
        if (blocked) {
          return blocked;
        }
        const element = this.resolveElement(message.refId);
        if (!element.ok) {
          return element;
        }
        element.element.click();
        return {
          ok: true,
          ref: response.ref,
          changedPage: true
        };
      }
      case CONTENT_RPC_MESSAGES.IFRAME_TYPE: {
        const unauthorized = this.validateIframeActionToken(message.actionToken, {
          action: 'type',
          refId: message.refId
        });
        if (unauthorized) {
          return unauthorized;
        }
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
        }
        const readiness = checkResolvedActionReadiness(
          {
            kind: 'type',
            refId: message.refId,
            source: 'runtime',
            valuePreview: message.valuePreview
          },
          response.ref as ResolvedRefElement
        );
        const blocked = this.blockedIframeReadiness(readiness);
        if (blocked) {
          return blocked;
        }
        const element = this.resolveElement(message.refId);
        if (!element.ok) {
          return element;
        }
        if (!isTextEntryElement(element.element)) {
          return {
            ok: false,
            code: ERROR_CODES.ELEMENT_NOT_ACTIONABLE,
            message: 'Target element does not accept text input'
          };
        }
        element.element.value = message.text;
        element.element.dispatchEvent(new Event('input', { bubbles: true }));
        element.element.dispatchEvent(new Event('change', { bubbles: true }));
        return {
          ok: true,
          ref: response.ref,
          changedPage: true
        };
      }
      // form fill actions
      case CONTENT_RPC_MESSAGES.FORM_FILL_FIELD: {
        const fr = fillSingleField(this.document, this.ensureRefMap(), { fieldRefId: message.fieldRefId, value: message.value, clear: message.clear });
        if (fr.status === 'failed') {
          return { ok: false, code: ERROR_CODES.TOOL_EXECUTION_FAILED, message: 'fill field failed' };
        }
        return { ok: true, fillFieldResult: fr } as unknown as ContentRpcResponse;
      }
      case CONTENT_RPC_MESSAGES.FORM_FILL_MANY: {
        const mr = fillManyFields(this.document, this.ensureRefMap(), message.targets);
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
        return { ok: true, verifyResult: verifyForm(this.document, fm, message.submitRefId) } as unknown as ContentRpcResponse;
      }
      case CONTENT_RPC_MESSAGES.FORM_EXECUTE_SUBMIT: {
        const sr = executeSubmit(this.document, this.ensureRefMap(), message.submitTargetRefId);
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

  private createIframeActionToken(refId: string, action: IframeActionKind): string {
    this.pruneExpiredIframeActionTokens();
    const token = createOpaqueToken();
    this.iframeActionGrants.set(token, {
      refId,
      action,
      expiresAt: Date.now() + IFRAME_ACTION_TOKEN_TTL_MS
    });
    return token;
  }

  private validateIframeActionToken(
    actionToken: string | undefined,
    expected: {
      action: IframeActionKind;
      refId: string;
    }
  ): ContentRpcResponse | undefined {
    this.pruneExpiredIframeActionTokens();
    if (!actionToken) {
      return iframeActionUnauthorized();
    }
    const grant = this.iframeActionGrants.get(actionToken);
    if (
      grant &&
      grant.refId === expected.refId &&
      grant.action === expected.action &&
      grant.expiresAt >= Date.now()
    ) {
      this.iframeActionGrants.delete(actionToken);
      return undefined;
    }
    if (grant && grant.expiresAt < Date.now()) {
      this.iframeActionGrants.delete(actionToken);
    }
    return iframeActionUnauthorized();
  }

  private pruneExpiredIframeActionTokens(): void {
    const now = Date.now();
    for (const [token, grant] of this.iframeActionGrants) {
      if (grant.expiresAt < now) {
        this.iframeActionGrants.delete(token);
      }
    }
  }

  private blockedIframeReadiness(
    readiness: ReturnType<typeof checkResolvedActionReadiness>
  ): ContentRpcResponse | undefined {
    if (!readiness.canAct) {
      return {
        ok: false,
        code: readiness.code,
        message: readiness.reason,
        detail: readiness
      };
    }
    if (readiness.wouldRequireApproval) {
      return {
        ok: false,
        code: ERROR_CODES.APPROVAL_REQUIRED,
        message: readiness.reason,
        detail: readiness
      };
    }
    return undefined;
  }

  private resolveElement(refId: string):
    | {
        ok: true;
        element: HTMLElement;
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
    if (entry?.element instanceof HTMLElement && !refMap.isEntryStale(entry)) {
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

function isTextEntryElement(
  element: HTMLElement
): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element.tagName.toLowerCase() === 'input' ||
    element.tagName.toLowerCase() === 'textarea'
  );
}

function highlightElement(element: Element): void {
  ensureHighlightStyle(element.ownerDocument);
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth'
    });
  }
  element.classList.add('bh-page-ref-highlight');
  const ownerWindow = element.ownerDocument.defaultView ?? window;
  ownerWindow.setTimeout(() => {
    element.classList.remove('bh-page-ref-highlight');
  }, 1800);
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

function iframeActionUnauthorized(): ContentRpcResponse {
  return {
    ok: false,
    code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED,
    message: 'Iframe mutations must be routed through the runtime tool boundary'
  };
}

function createOpaqueToken(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return `bh_iframe_${cryptoObject.randomUUID()}`;
  }
  if (cryptoObject && typeof cryptoObject.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    return `bh_iframe_${Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')}`;
  }
  return `bh_iframe_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2)}`;
}
