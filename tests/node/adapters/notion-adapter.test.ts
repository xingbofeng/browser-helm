import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'notion',
  label: 'Notion',
  url: 'https://example.notion.site/project',
  workflowId: 'notion-open-page',
  locatorId: 'notion-sidebar-search',
  fixtureNeedle: 'Notion Sidebar fixture',
  guidanceNeedle: 'Open page workflow',
  approvalRequired: false,
  matchingCandidate: {
    refId: 'notion_sidebar_search',
    label: 'Search',
    selector: '[aria-label*="Search"]'
  }
});
