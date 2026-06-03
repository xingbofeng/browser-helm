import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'stripe',
  label: 'Stripe',
  url: 'https://dashboard.stripe.com/customers',
  workflowId: 'stripe-open-customer',
  locatorId: 'stripe-dashboard-search',
  fixtureNeedle: 'Stripe Dashboard fixture',
  guidanceNeedle: 'Open customer workflow',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'stripe_dashboard_search',
    label: 'Search',
    selector: 'input[placeholder*="Search"]'
  }
});
