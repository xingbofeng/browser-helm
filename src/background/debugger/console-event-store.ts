import type { CdpConsoleEvent } from '../../shared/schemas/cdp-event';
import { cdpConsoleEventSchema } from '../../shared/schemas/cdp-event';
import { redactCdpText, redactCdpUrl } from './cdp-redaction';

export class ConsoleEventStore {
  private readonly events: CdpConsoleEvent[] = [];

  addConsoleApi(payload: Record<string, unknown>, timestamp = Date.now()): void {
    const args = Array.isArray(payload.args) ? payload.args : [];
    const text = args.map(consoleArgText).filter(Boolean).join(' ');
    this.push({
      id: `console_${timestamp}_${this.events.length}`,
      level: stringField(payload, 'type') ?? 'log',
      text: redactCdpText(text || 'Console event', 2_000),
      timestamp
    });
  }

  addException(payload: Record<string, unknown>, timestamp = Date.now()): void {
    const details = recordField(payload, 'exceptionDetails');
    const url = details ? stringField(details, 'url') : undefined;
    this.push({
      id: `exception_${timestamp}_${this.events.length}`,
      level: 'error',
      text: redactCdpText((details ? stringField(details, 'text') : undefined) ?? 'Runtime exception', 2_000),
      ...(url ? { url: redactCdpUrl(url) } : {}),
      ...(details && typeof details.lineNumber === 'number' ? { lineNumber: details.lineNumber } : {}),
      timestamp
    });
  }

  list(limit = 100): CdpConsoleEvent[] {
    return this.events.slice(-limit).reverse();
  }

  private push(event: CdpConsoleEvent): void {
    this.events.push(cdpConsoleEventSchema.parse(event));
    if (this.events.length > 300) {
      this.events.shift();
    }
  }
}

function consoleArgText(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }
  if (typeof value.value === 'string') {
    return value.value;
  }
  if (typeof value.description === 'string') {
    return value.description;
  }
  return '';
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
