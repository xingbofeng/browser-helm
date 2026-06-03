import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'supabase',
  label: 'Supabase',
  url: 'https://app.supabase.com/project/example',
  workflowId: 'supabase-open-project',
  locatorId: 'supabase-sidebar',
  fixtureNeedle: 'Supabase Sidebar fixture',
  guidanceNeedle: 'Open project workflow',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'supabase_sidebar',
    label: 'Table Editor',
    selector: 'nav a'
  }
});
