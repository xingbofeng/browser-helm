import type { AdapterId } from './adapter-types';

export const BROWSER_HELM_DOMAIN_ADAPTER_SETTINGS_KEY = 'domainAdapterSettings';

export type DomainAdapterSettings = {
  disabledAdapterIds: AdapterId[];
};

export const DEFAULT_DOMAIN_ADAPTER_SETTINGS: DomainAdapterSettings = {
  disabledAdapterIds: []
};

export class DomainAdapterPreferences {
  private disabledAdapterIds = new Set<AdapterId>();

  getSettings(): DomainAdapterSettings {
    return {
      disabledAdapterIds: [...this.disabledAdapterIds]
    };
  }

  setSettings(settings: DomainAdapterSettings): void {
    this.disabledAdapterIds = new Set(settings.disabledAdapterIds);
  }

  setEnabled(adapterId: AdapterId, enabled: boolean): DomainAdapterSettings {
    if (enabled) {
      this.disabledAdapterIds.delete(adapterId);
    } else {
      this.disabledAdapterIds.add(adapterId);
    }
    return this.getSettings();
  }

  isDisabled(adapterId: AdapterId): boolean {
    return this.disabledAdapterIds.has(adapterId);
  }

  clear(): void {
    this.disabledAdapterIds.clear();
  }
}

export const defaultDomainAdapterPreferences = new DomainAdapterPreferences();

export function isDomainAdapterSettings(value: unknown): value is DomainAdapterSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.disabledAdapterIds) &&
    record.disabledAdapterIds.every(isAdapterId);
}

export function normalizeDomainAdapterSettings(value: unknown): DomainAdapterSettings {
  return isDomainAdapterSettings(value) ? value : DEFAULT_DOMAIN_ADAPTER_SETTINGS;
}

function isAdapterId(value: unknown): value is AdapterId {
  return value === 'github' ||
    value === 'gmail' ||
    value === 'notion' ||
    value === 'linear' ||
    value === 'jira' ||
    value === 'stripe' ||
    value === 'vercel' ||
    value === 'supabase';
}
