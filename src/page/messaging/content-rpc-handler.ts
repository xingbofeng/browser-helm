import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { resolveRef, type ResolvedRefElement } from '../a11y/ref-resolver';
import { checkResolvedActionReadiness } from '../dom/action-readiness';
import { buildObservation } from '../observe/build-observation';
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
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
        }
        const element = this.resolveAnyElement(message.refId);
        if (!element.ok) {
          return element;
        }
        highlightElement(element.element);
        return {
          ok: true,
          ref: response.ref,
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
