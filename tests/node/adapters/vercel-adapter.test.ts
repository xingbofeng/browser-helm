import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'vercel',
  label: 'Vercel',
  url: 'https://vercel.com/counter/browser-helm',
  workflowId: 'vercel-open-project',
  locatorId: 'vercel-project-search',
  fixtureNeedle: 'Vercel Project fixture',
  guidanceNeedle: 'Open project workflow',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'vercel_project_search',
    label: 'Search',
    selector: 'input[placeholder*="Search"]'
  }
});
