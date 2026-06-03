import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'github',
  label: 'GitHub',
  url: 'https://github.com/openai/browser-helm/issues',
  workflowId: 'github-open-issue',
  locatorId: 'github-issues-tab',
  fixtureNeedle: 'GitHub Issues fixture',
  guidanceNeedle: 'repository navigation landmarks',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'github_issues_tab',
    label: 'Issues',
    selector: 'a[data-tab-item="issues-tab"]'
  }
});
