import { buildA11ySnapshot } from '../a11y/a11y-snapshot';
import { RefMap } from '../a11y/ref-map';
import { resolveRef } from '../a11y/ref-resolver';
import { buildObservation } from '../observe/build-observation';
import { readPageMetadata } from '../observe/page-metadata';
import { ERROR_CODES } from '../../shared/constants/error-codes';
import { CONTENT_RPC_MESSAGES } from '../../shared/constants/event-names';
import { IFRAME_ACTION_TOKEN } from '../../shared/constants/runtime-auth';
import {
  contentRpcRequestSchema,
  type ContentRpcRequest,
  type ContentRpcResponse
} from './content-rpc.schema';

export class ContentRpcHandler {
  private refMap: RefMap | undefined;

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
      case CONTENT_RPC_MESSAGES.IFRAME_CLICK: {
        const unauthorized = this.validateIframeActionToken(message.actionToken);
        if (unauthorized) {
          return unauthorized;
        }
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
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
        const unauthorized = this.validateIframeActionToken(message.actionToken);
        if (unauthorized) {
          return unauthorized;
        }
        const response = this.readIframeTarget(message.refId);
        if (!response.ok || !('ref' in response)) {
          return response;
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

  private validateIframeActionToken(
    actionToken: string | undefined
  ): ContentRpcResponse | undefined {
    if (actionToken === IFRAME_ACTION_TOKEN) {
      return undefined;
    }
    return {
      ok: false,
      code: ERROR_CODES.IFRAME_ACTION_UNAUTHORIZED,
      message: 'Iframe mutations must be routed through the runtime tool boundary'
    };
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
