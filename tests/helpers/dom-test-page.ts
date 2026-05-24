import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Window } from 'happy-dom';

type DomTestPage = {
  window: Window;
  document: Document;
  mutate: (fn: (document: Document) => void) => void;
};

export function loadDomFixture(filename: string, url: string): DomTestPage {
  const html = readFileSync(
    join(process.cwd(), 'tests/fixtures/pages', filename),
    'utf8'
  );
  const window = new Window({ url });
  window.document.write(html);
  window.document.close();

  return {
    window,
    document: window.document as unknown as Document,
    mutate(fn) {
      fn(window.document as unknown as Document);
    }
  };
}
