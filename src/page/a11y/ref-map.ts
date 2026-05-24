import type { ElementRef } from '../../shared/schemas/observation.schema';

export type RefScope = {
  tabId?: number;
  documentId: string;
  origin: string;
};

type RefEntry = {
  element: Element;
  summary: ElementRef;
  scope: RefScope;
};

export class RefMap {
  private nextId = 101;
  private readonly refs = new Map<string, RefEntry>();

  constructor(private scope: RefScope) {}

  updateScope(scope: RefScope): void {
    this.scope = scope;
  }

  register(element: Element, summary: Omit<ElementRef, 'refId'>): ElementRef {
    const existing = this.findExistingRef(element);
    if (existing) {
      return existing.summary;
    }

    const refId = `ref_${this.nextId}`;
    this.nextId += 1;
    const fullSummary = {
      ...summary,
      refId
    };
    this.refs.set(refId, {
      element,
      summary: fullSummary,
      scope: { ...this.scope }
    });
    return fullSummary;
  }

  resolve(refId: string): RefEntry | undefined {
    return this.refs.get(refId);
  }

  isEntryStale(entry: RefEntry): boolean {
    return (
      entry.scope.documentId !== this.scope.documentId ||
      entry.scope.origin !== this.scope.origin ||
      !entry.element.isConnected
    );
  }

  summary(): ElementRef[] {
    return Array.from(this.refs.values())
      .filter((entry) => !this.isEntryStale(entry))
      .map((entry) => entry.summary);
  }

  clear(): void {
    this.refs.clear();
    this.nextId = 101;
  }

  private findExistingRef(element: Element): RefEntry | undefined {
    return Array.from(this.refs.values()).find((entry) => entry.element === element);
  }
}
