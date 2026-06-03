import { Power, ShieldCheck } from 'lucide-react';

import type { RuntimeDomainAdapterId, RuntimeDomainAdapterSnapshot } from '../../runtime/runtime-messages';
import { useT } from '../../i18n/context';

type DomainAdapterStatusProps = {
  adapter?: RuntimeDomainAdapterSnapshot | undefined;
  onSetEnabled?: ((adapterId: RuntimeDomainAdapterId, enabled: boolean) => void) | undefined;
};

export function DomainAdapterStatus({ adapter, onSetEnabled }: DomainAdapterStatusProps) {
  const t = useT();
  const state = adapter ?? {
    enabled: false as const,
    fallback: 'generic_browser_tools' as const,
    reason: t('adapter.genericReason')
  };
  const disabledAdapter = !state.enabled ? state.disabledAdapter : undefined;
  const toggleAdapter = state.enabled
    ? { id: state.id, enabled: false, label: t('adapter.disableAction', { label: state.label }) }
    : disabledAdapter
      ? { id: disabledAdapter.id, enabled: true, label: t('adapter.enableAction', { label: disabledAdapter.label }) }
      : undefined;
  return (
    <section className="bh-domainAdapterStatus" aria-label={t('adapter.statusAria')}>
      <div className="bh-domainAdapterIcon" aria-hidden="true">
        <ShieldCheck size={16} />
      </div>
      <div className="bh-domainAdapterBody">
        <div className="bh-domainAdapterTitle">
          {state.enabled ? t('adapter.enabledTitle', { label: state.label }) : t('adapter.genericTitle')}
        </div>
        <div className="bh-domainAdapterMeta">
          {state.enabled
            ? t('adapter.enabledMeta', {
                workflows: String(state.workflowCount),
                locators: String(state.locatorCount)
              })
            : state.reason}
        </div>
      </div>
      {state.enabled && state.approvalEnforced ? (
        <span className="bh-domainAdapterPolicy">
          {t('adapter.approvalEnforced')}
        </span>
      ) : null}
      {state.enabled && state.driftStatus && state.driftStatus.status !== 'ok' ? (
        <div className="bh-domainAdapterDrift">
          <span>{t(`adapter.drift.${state.driftStatus.status}`)}</span>
          <span>{state.driftStatus.genericFallbackReason}</span>
        </div>
      ) : null}
      {state.enabled && state.lastFailure ? (
        <div className="bh-domainAdapterFailure">
          {t('adapter.lastFailure', { code: state.lastFailure.errorCode })}
          {state.lastFailure.locatorId ? ` ${state.lastFailure.locatorId}` : ''}
          {state.lastFailure.workflowId ? ` ${state.lastFailure.workflowId}` : ''}
        </div>
      ) : null}
      {toggleAdapter && onSetEnabled ? (
        <button
          type="button"
          className="bh-domainAdapterToggle"
          aria-label={toggleAdapter.label}
          title={toggleAdapter.label}
          onClick={() => onSetEnabled(toggleAdapter.id, toggleAdapter.enabled)}
        >
          <Power size={14} />
        </button>
      ) : null}
    </section>
  );
}
