import type { Page } from '@playwright/test';

import type { RunMode } from '../../../../src/shared/schemas/tool.schema';
import type { ProviderSettings } from '../../../../src/storage/interfaces/settings-store';
import type { RunSnapshot } from '../../../../src/runtime/runtime-messages';
import type { RealModelScenarioHelpers } from '../../flows/real-model-scenario-runner';

export type RealModelScenarioResult = {
  page: Page;
  snapshot: RunSnapshot;
  beforeUrl: string;
  settings: ProviderSettings;
};

export type RealModelScenarioContext = {
  fixtureOrigin: string;
};

export type RealModelScenarioText =
  | string
  | ((context: RealModelScenarioContext) => string);

export type RealModelScenario = {
  id: string;
  title: string;
  url: RealModelScenarioText;
  enabledDomains?: string[] | undefined;
  task: RealModelScenarioText;
  mode: RunMode;
  runKind: 'answer' | 'form_assist';
  dumpName: string;
  pollAttempts?: number | undefined;
  beforeRun?: (page: Page, helpers: RealModelScenarioHelpers) => Promise<void>;
  assert: (
    result: RealModelScenarioResult,
    helpers: RealModelScenarioHelpers
  ) => Promise<void>;
};
