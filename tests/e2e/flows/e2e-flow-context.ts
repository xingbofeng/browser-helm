import { type BrowserContext } from '@playwright/test';

import { getExtensionId } from '../helpers/extension-id';
import {
  launchExtension,
  type LaunchedExtension
} from '../helpers/launch-extension';
import {
  startFixtureServer,
  type FixtureServer
} from '../helpers/fixture-server';
import { ExtensionShellPage } from '../pages/extension-shell-page';
import { FixturePage } from '../pages/fixture-page';
import { SidePanelPage } from '../pages/side-panel-page';

export class E2EFlowContext {
  private constructor(
    private readonly server: FixtureServer,
    private readonly extension: LaunchedExtension,
    readonly extensionId: string
  ) {}

  static async create(): Promise<E2EFlowContext> {
    const server = await startFixtureServer();
    const extension = await launchExtension();
    const extensionId = await getExtensionId(extension.context);
    return new E2EFlowContext(server, extension, extensionId);
  }

  get origin(): string {
    return this.server.origin;
  }

  get context(): BrowserContext {
    return this.extension.context;
  }

  async fixturePage(): Promise<FixturePage> {
    const page = await this.context.newPage();
    return new FixturePage(page, this.origin);
  }

  shell(): ExtensionShellPage {
    return new ExtensionShellPage(this.context, this.extensionId);
  }

  sidePanel(): SidePanelPage {
    return new SidePanelPage(this.context, this.extensionId);
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.server.close();
  }
}
