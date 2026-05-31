import type { CdpAttachState, CdpEventListener, CdpPerformanceSnapshot } from '../../shared/schemas/cdp-event';
import type { NetworkRequestRecord, RequestDetail } from '../../shared/schemas/network-request';
import { cdpAttachStateSchema, cdpEventListenerSchema } from '../../shared/schemas/cdp-event';
import { ConsoleEventStore } from './console-event-store';
import { NetworkEventStore } from './network-event-store';
import { buildPerformanceSnapshot } from './performance-store';

const PROTOCOL_VERSION = '1.3';

type CdpTarget = chrome.debugger.Debuggee;
type CdpCommandResult = Record<string, unknown>;

export class DebuggerManager {
  private readonly sessions = new Map<number, {
    attachedAt: number;
    network: NetworkEventStore;
    console: ConsoleEventStore;
  }>();
  private listening = false;

  async attach(tabId: number, protocolVersion = PROTOCOL_VERSION): Promise<CdpAttachState> {
    if (!globalThis.chrome?.debugger?.attach) {
      return cdpAttachStateSchema.parse({
        tabId,
        attached: false,
        protocolVersion,
        reason: 'chrome.debugger permission or API is unavailable'
      });
    }
    this.ensureListener();
    const target = { tabId };
    try {
      await chrome.debugger.attach(target, protocolVersion);
      this.sessions.set(tabId, {
        attachedAt: Date.now(),
        network: new NetworkEventStore(),
        console: new ConsoleEventStore()
      });
      await this.enableCollectors(target);
      return cdpAttachStateSchema.parse({
        tabId,
        attached: true,
        protocolVersion,
        attachedAt: Date.now()
      });
    } catch (error) {
      return cdpAttachStateSchema.parse({
        tabId,
        attached: false,
        protocolVersion,
        reason: error instanceof Error ? error.message : 'debugger_attach_failed'
      });
    }
  }

  async detach(tabId: number): Promise<CdpAttachState> {
    if (!globalThis.chrome?.debugger?.detach) {
      this.sessions.delete(tabId);
      return cdpAttachStateSchema.parse({
        tabId,
        attached: false,
        protocolVersion: PROTOCOL_VERSION,
        reason: 'chrome.debugger API is unavailable'
      });
    }
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
      // Detach is idempotent from BrowserHelm's perspective.
    }
    this.sessions.delete(tabId);
    return cdpAttachStateSchema.parse({
      tabId,
      attached: false,
      protocolVersion: PROTOCOL_VERSION
    });
  }

  async targets(): Promise<chrome.debugger.TargetInfo[]> {
    if (!globalThis.chrome?.debugger?.getTargets) {
      return [];
    }
    return chrome.debugger.getTargets();
  }

  consoleEvents(tabId: number, limit?: number) {
    return this.session(tabId).console.list(limit);
  }

  networkEvents(tabId: number): NetworkRequestRecord[] {
    return this.session(tabId).network.list();
  }

  async requestDetail(tabId: number, requestId: string): Promise<RequestDetail | undefined> {
    let body: { body: string; base64Encoded?: boolean | undefined } | undefined;
    try {
      const result = await this.sendCommand({ tabId }, 'Network.getResponseBody', { requestId });
      if (typeof result.body === 'string') {
        body = {
          body: result.body,
          base64Encoded: result.base64Encoded === true
        };
      }
    } catch {
      body = undefined;
    }
    return this.session(tabId).network.detail(requestId, body);
  }

  async responseBody(tabId: number, requestId: string): Promise<{
    requestId: string;
    body?: string | undefined;
    base64Encoded?: boolean | undefined;
    unavailableReason?: string | undefined;
  }> {
    try {
      const result = await this.sendCommand({ tabId }, 'Network.getResponseBody', { requestId });
      return {
        requestId,
        body: typeof result.body === 'string' ? result.body : '',
        base64Encoded: result.base64Encoded === true
      };
    } catch (error) {
      return {
        requestId,
        unavailableReason: error instanceof Error ? error.message : 'response_body_unavailable'
      };
    }
  }

  async performanceMetrics(tabId: number): Promise<CdpPerformanceSnapshot> {
    const result = await this.sendCommand({ tabId }, 'Performance.getMetrics');
    return buildPerformanceSnapshot(tabId, Array.isArray(result.metrics) ? result.metrics : []);
  }

  async eventListeners(tabId: number, objectExpression = 'document'): Promise<CdpEventListener[]> {
    const evaluated = await this.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: objectExpression,
      objectGroup: 'browserhelm-cdp',
      includeCommandLineAPI: true
    });
    const objectId = readObjectId(evaluated);
    if (!objectId) {
      return [];
    }
    const result = await this.sendCommand({ tabId }, 'DOMDebugger.getEventListeners', { objectId });
    return Array.isArray(result.listeners)
      ? result.listeners.flatMap((listener) => parseListener(listener))
      : [];
  }

  async captureDomSnapshot(tabId: number): Promise<CdpCommandResult> {
    return this.sendCommand({ tabId }, 'DOMSnapshot.captureSnapshot', {
      computedStyles: []
    });
  }

  async captureScreenshot(tabId: number, options: { fullPage?: boolean } = {}): Promise<{
    dataUrl: string;
    width?: number | undefined;
    height?: number | undefined;
  }> {
    const result = await this.withAttachedTarget(tabId, async () => {
      const metrics = options.fullPage
        ? await this.sendCommand({ tabId }, 'Page.getLayoutMetrics')
        : undefined;
      const contentSize = readContentSize(metrics);
      const screenshot = await this.sendCommand({ tabId }, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: options.fullPage === true,
        fromSurface: true,
        ...(contentSize ? {
          clip: {
            x: 0,
            y: 0,
            width: contentSize.width,
            height: contentSize.height,
            scale: 1
          }
        } : {})
      });
      return { screenshot, contentSize };
    });
    const data = result.screenshot.data;
    if (typeof data !== 'string' || data.length === 0) {
      throw new Error('CDP screenshot data unavailable');
    }
    return {
      dataUrl: `data:image/png;base64,${data}`,
      ...(result.contentSize ? {
        width: Math.round(result.contentSize.width),
        height: Math.round(result.contentSize.height)
      } : {})
    };
  }

  async evaluate(tabId: number, expression: string): Promise<CdpCommandResult> {
    return this.withAttachedTarget(tabId, async () =>
      await this.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: false
      })
    );
  }

  async dispatchMouseClick(tabId: number, x: number, y: number): Promise<void> {
    await this.withAttachedTarget(tabId, async () => {
      await this.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y
      });
      await this.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1
      });
      await this.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1
      });
      return {};
    });
  }

  isAttached(tabId: number): boolean {
    return this.sessions.has(tabId);
  }

  private session(tabId: number): { network: NetworkEventStore; console: ConsoleEventStore } {
    return this.sessions.get(tabId) ?? this.createDetachedSession(tabId);
  }

  private createDetachedSession(tabId: number): { network: NetworkEventStore; console: ConsoleEventStore } {
    const session = {
      attachedAt: Date.now(),
      network: new NetworkEventStore(),
      console: new ConsoleEventStore()
    };
    this.sessions.set(tabId, session);
    return session;
  }

  private async enableCollectors(target: CdpTarget): Promise<void> {
    await Promise.allSettled([
      this.sendCommand(target, 'Network.enable'),
      this.sendCommand(target, 'Runtime.enable'),
      this.sendCommand(target, 'Performance.enable')
    ]);
  }

  private async sendCommand(
    target: CdpTarget,
    method: string,
    commandParams?: Record<string, unknown>
  ): Promise<CdpCommandResult> {
    if (!globalThis.chrome?.debugger?.sendCommand) {
      throw new Error('chrome.debugger.sendCommand unavailable');
    }
    return chrome.debugger.sendCommand(target, method, commandParams) as Promise<CdpCommandResult>;
  }

  private async withAttachedTarget<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
    const alreadyAttached = this.isAttached(tabId);
    if (!alreadyAttached) {
      const state = await this.attach(tabId);
      if (!state.attached) {
        throw new Error(state.reason ?? 'debugger_attach_failed');
      }
    }
    try {
      return await fn();
    } finally {
      if (!alreadyAttached) {
        await this.detach(tabId);
      }
    }
  }

  private ensureListener(): void {
    if (this.listening || !globalThis.chrome?.debugger?.onEvent) {
      return;
    }
    this.listening = true;
    chrome.debugger.onEvent.addListener((source, method, params) => {
      if (!source.tabId || !params || typeof params !== 'object') {
        return;
      }
      this.handleEvent(source.tabId, method, params as Record<string, unknown>);
    });
    chrome.debugger.onDetach?.addListener((source) => {
      if (source.tabId) {
        this.sessions.delete(source.tabId);
      }
    });
  }

  private handleEvent(tabId: number, method: string, params: Record<string, unknown>): void {
    const session = this.session(tabId);
    if (method === 'Network.requestWillBeSent') {
      session.network.requestWillBeSent(params);
      return;
    }
    if (method === 'Network.responseReceived') {
      session.network.responseReceived(params);
      return;
    }
    if (method === 'Network.loadingFailed') {
      session.network.loadingFailed(params);
      return;
    }
    if (method === 'Network.loadingFinished') {
      session.network.loadingFinished(params);
      return;
    }
    if (method === 'Runtime.consoleAPICalled') {
      session.console.addConsoleApi(params);
      return;
    }
    if (method === 'Runtime.exceptionThrown') {
      session.console.addException(params);
    }
  }
}

export const defaultDebuggerManager = new DebuggerManager();

function readObjectId(value: Record<string, unknown>): string | undefined {
  const result = value.result;
  return typeof result === 'object' &&
    result !== null &&
    !Array.isArray(result) &&
    typeof (result as Record<string, unknown>).objectId === 'string'
    ? (result as Record<string, unknown>).objectId as string
    : undefined;
}

function readContentSize(value: Record<string, unknown> | undefined): { width: number; height: number } | undefined {
  const contentSize = value?.contentSize;
  if (typeof contentSize !== 'object' || contentSize === null || Array.isArray(contentSize)) {
    return undefined;
  }
  const width = (contentSize as Record<string, unknown>).width;
  const height = (contentSize as Record<string, unknown>).height;
  return typeof width === 'number' && width > 0 && typeof height === 'number' && height > 0
    ? { width, height }
    : undefined;
}

function parseListener(value: unknown): CdpEventListener[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [];
  }
  const record = value as Record<string, unknown>;
  const parsed = cdpEventListenerSchema.safeParse({
    type: record.type,
    useCapture: record.useCapture,
    passive: record.passive,
    once: record.once,
    handlerDescription: handlerDescription(record.handler)
  });
  return parsed.success ? [parsed.data] : [];
}

function handlerDescription(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const description = (value as Record<string, unknown>).description;
  return typeof description === 'string' ? description : undefined;
}
