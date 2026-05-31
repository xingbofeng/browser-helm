import type { CdpConsoleEvent } from '../../shared/schemas/cdp-event';
import { useT } from '../../i18n/context';

type ConsoleEventPanelProps = {
  events?: CdpConsoleEvent[] | undefined;
};

export function ConsoleEventPanel({ events = [] }: ConsoleEventPanelProps) {
  const t = useT();
  return (
    <section className="bh-cdpPanel" aria-label={t('debug.cdp.console.aria')}>
      <header className="bh-cdpPanelHeader">
        <div>
          <h3>{t('debug.cdp.console.title')}</h3>
          <p>{events.length ? t('debug.cdp.console.captured', { count: String(events.length) }) : t('debug.cdp.console.none')}</p>
        </div>
      </header>
      {events.length ? (
        <ul className="bh-consoleEvents">
          {events.map((event) => (
            <li key={event.id} className={`bh-consoleEvent bh-consoleEvent--${event.level}`}>
              <span>{event.level}</span>
              <code>{event.text}</code>
              {event.url ? <small>{event.url}{event.lineNumber !== undefined ? `:${event.lineNumber}` : ''}</small> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="bh-emptyState">{t('debug.cdp.console.empty')}</p>
      )}
    </section>
  );
}
