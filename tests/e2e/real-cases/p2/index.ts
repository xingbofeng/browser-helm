import { downloadMetadataReadScenario } from './download-metadata-read';
import { fixtureLongPagePaginationScenario } from './fixture-long-page-pagination';
import { stackOverflowSearchOrBlockDialogue } from './stackoverflow-search-or-block-dialogue';
import { storageStateReadScenario } from './storage-state-read';
import { tabFocusMultitaskScenario } from './tab-focus-multitask';

export const p2RealModelScenarios = [
  stackOverflowSearchOrBlockDialogue,
  downloadMetadataReadScenario,
  storageStateReadScenario,
  tabFocusMultitaskScenario,
  fixtureLongPagePaginationScenario
];
