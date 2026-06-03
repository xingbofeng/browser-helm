import { runAdapterFixtureContract } from './adapter-fixture-test-helper';

runAdapterFixtureContract({
  id: 'linear',
  label: 'Linear',
  url: 'https://linear.app/browser-helm/issue/BH-1/test',
  workflowId: 'linear-open-issue',
  locatorId: 'linear-command-menu',
  fixtureNeedle: 'Linear Command fixture',
  guidanceNeedle: 'Open issue workflow',
  approvalRequired: true,
  matchingCandidate: {
    refId: 'linear_command_menu',
    label: 'Command menu',
    selector: '[aria-label*="Command"]'
  }
});
