import { ConsoleEventStore } from './console-event-store';
import { NetworkEventStore } from './network-event-store';

export type CdpSessionOwner = 'browserhelm';
export type CdpDomain = 'Network' | 'Runtime' | 'Performance';

export type CdpSessionState = {
  tabId: number;
  owner: CdpSessionOwner;
  attached: boolean;
  protocolVersion: string;
  createdAt: number;
  attachedAt: number;
  lastEventAt?: number | undefined;
  enabledDomains: CdpDomain[];
  detachReason?: string | undefined;
};

export type CdpSession = CdpSessionState & {
  network: NetworkEventStore;
  console: ConsoleEventStore;
};

export function createCdpSession(input: {
  tabId: number;
  owner: CdpSessionOwner;
  protocolVersion: string;
  createdAt: number;
}): CdpSession {
  return {
    tabId: input.tabId,
    owner: input.owner,
    attached: true,
    protocolVersion: input.protocolVersion,
    createdAt: input.createdAt,
    attachedAt: input.createdAt,
    enabledDomains: [],
    network: new NetworkEventStore(),
    console: new ConsoleEventStore()
  };
}

export function snapshotCdpSession(session: CdpSession, input: {
  attached: boolean;
  detachReason?: string | undefined;
}): CdpSessionState {
  return {
    tabId: session.tabId,
    owner: session.owner,
    attached: input.attached,
    protocolVersion: session.protocolVersion,
    createdAt: session.createdAt,
    attachedAt: session.attachedAt,
    ...(session.lastEventAt === undefined ? {} : { lastEventAt: session.lastEventAt }),
    enabledDomains: [...session.enabledDomains],
    ...(input.detachReason === undefined ? {} : { detachReason: input.detachReason })
  };
}
