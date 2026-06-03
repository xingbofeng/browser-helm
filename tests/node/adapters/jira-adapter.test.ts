import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'jira',
  label: 'Jira',
  url: 'https://browserhelm.atlassian.net/browse/BH-1',
  workflowId: 'jira-open-issue',
  locatorId: 'jira-search',
  fixtureNeedle: 'Jira Search fixture',
  guidanceNeedle: 'issue key search',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'jira_search',
    label: 'Search',
    selector: 'input[aria-label*="Search"]'
  }
});
