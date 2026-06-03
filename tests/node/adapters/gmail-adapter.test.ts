import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'gmail',
  label: 'Gmail',
  url: 'https://mail.google.com/mail/u/0/#inbox',
  workflowId: 'gmail-search-mail',
  locatorId: 'gmail-search-box',
  fixtureNeedle: 'Gmail Search fixture',
  guidanceNeedle: 'Search mail workflow',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'gmail_search_box',
    label: 'Search mail',
    selector: 'input[aria-label="Search mail"]'
  }
});
