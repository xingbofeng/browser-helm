import type { RequestDetail, NetworkRequestRecord } from '../../shared/schemas/network-request';
import { useT } from '../../i18n/context';

type RequestInspectorProps = {
  requests?: NetworkRequestRecord[] | undefined;
  detail?: RequestDetail | undefined;
  status?: 'detached' | 'attaching' | 'attached' | 'error' | 'externally_detached' | undefined;
  reason?: string | undefined;
};

export function RequestInspector({ requests = [], detail, status = 'detached', reason }: RequestInspectorProps) {
  const t = useT();
  const selected = detail ?? requests[0];
  return (
    <section className="bh-cdpPanel" aria-label={t('debug.cdp.requestInspector.aria')}>
      <header className="bh-cdpPanelHeader">
        <div>
          <h3>{t('debug.cdp.requestInspector.title')}</h3>
          <p>{statusText(t, status, reason)}</p>
        </div>
        <span className={`bh-cdpStatus bh-cdpStatus--${status}`}>{status}</span>
      </header>
      {requests.length === 0 && !selected ? (
        <p className="bh-emptyState">{t('debug.cdp.requestInspector.empty')}</p>
      ) : (
        <div className="bh-requestInspectorGrid">
          <div className="bh-requestList" role="list">
            {requests.map((request) => (
              <div key={request.requestId} className="bh-requestListItem" role="listitem">
                <span className="bh-requestMethod">{request.method}</span>
                <span className={request.failed || statusIsError(request.status) ? 'bh-requestStatus--error' : 'bh-requestStatus'}>
                  {request.failed ? 'failed' : request.status ?? 'pending'}
                </span>
                <code>{request.url}</code>
              </div>
            ))}
          </div>
          {selected ? <RequestDetailView detail={selected} /> : null}
        </div>
      )}
    </section>
  );
}

function RequestDetailView({ detail }: { detail: RequestDetail | NetworkRequestRecord }) {
  const t = useT();
  return (
    <div className="bh-requestDetail">
      <div className="bh-requestDetailTitle">
        <strong>{detail.method} {detail.status ?? 'pending'}</strong>
        <code>{detail.requestId}</code>
      </div>
      <code className="bh-requestUrl">{detail.url}</code>
      <HeaderBlock title={t('debug.cdp.requestInspector.requestHeaders')} headers={detail.requestHeadersPreview} />
      <HeaderBlock title={t('debug.cdp.requestInspector.responseHeaders')} headers={detail.responseHeadersPreview ?? {}} />
      {'responseBodyPreview' in detail && detail.responseBodyPreview && detail.responseBodyAvailable ? (
        <pre className="bh-cdpBodyPreview">{detail.responseBodyPreview}</pre>
      ) : (
        <p className="bh-emptyState">{detail.responseBodyUnavailableReason ?? t('debug.cdp.requestInspector.bodyUnavailable')}</p>
      )}
    </div>
  );
}

function HeaderBlock({ title, headers }: { title: string; headers: Record<string, string> }) {
  const t = useT();
  const entries = Object.entries(headers);
  return (
    <section className="bh-headerBlock">
      <h4>{title}</h4>
      {entries.length ? (
        <dl>
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="bh-emptyState">{t('debug.cdp.requestInspector.noHeaders')}</p>
      )}
    </section>
  );
}

function statusText(t: ReturnType<typeof useT>, status: string, reason: string | undefined): string {
  if (status === 'attached') return t('debug.cdp.requestInspector.attached');
  if (status === 'attaching') return t('debug.cdp.requestInspector.attaching');
  if (status === 'externally_detached') {
    return t('debug.cdp.requestInspector.externallyDetached', {
      reason: reason ?? t('debug.cdp.requestInspector.unknownReason')
    });
  }
  if (status === 'error') return reason ?? t('debug.cdp.requestInspector.attachFailed');
  return t('debug.cdp.requestInspector.detached');
}

function statusIsError(status: number | undefined): boolean {
  return typeof status === 'number' && status >= 400;
}
