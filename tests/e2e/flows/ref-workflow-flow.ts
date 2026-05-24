import { expect } from '@playwright/test';

import { RefMappingPanel } from '../components/side-panel/ref-mapping-panel';
import { E2EFlowContext } from './e2e-flow-context';

type SnapshotResult = {
  snapshot: {
    elements: Array<{ refId: string }>;
  };
};

export class RefWorkflowFlow {
  private constructor(private readonly flowContext: E2EFlowContext) {}

  static async start(): Promise<RefWorkflowFlow> {
    return new RefWorkflowFlow(await E2EFlowContext.create());
  }

  async expectInteractiveElementsRefMapping(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('interactive-elements.html');

    const shell = this.flowContext.shell();
    const snapshot = await shell.snapshotActiveTab();
    expect(snapshot).toMatchObject({
      ok: true,
      snapshot: expect.objectContaining({
        elements: expect.arrayContaining([
          expect.objectContaining({ refId: 'ref_101', role: 'button' })
        ])
      })
    });

    const tabId = await shell.activeTabId();
    const sidePanelPage = await this.flowContext.sidePanel().open(tabId);
    const refMappingPanel = new RefMappingPanel(sidePanelPage);
    await refMappingPanel.expectVisible();
    await refMappingPanel.expectCanReturnToPageObservation();
  }

  async expectStaleRefAfterDomRemoval(): Promise<void> {
    const fixture = await this.flowContext.fixturePage();
    await fixture.goto('dynamic-page.html');

    const shell = this.flowContext.shell();
    const snapshot = await shell.snapshotActiveTab();
    expect(snapshot).toMatchObject({ ok: true });
    const refId = (snapshot as SnapshotResult).snapshot.elements[0]!.refId;

    await fixture.removeElement('#remove-me');

    await expect.poll(async () => shell.resolveActiveTabRef(refId)).toMatchObject({
      ok: false,
      code: 'REF_STALE'
    });
  }

  async close(): Promise<void> {
    await this.flowContext.close();
  }
}
