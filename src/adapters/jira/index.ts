import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const jiraAdapter = createSiteAdapter({
  id: 'jira',
  label: 'Jira',
  domains: ['atlassian.net', 'jira.com'],
  workflows: [{
    id: 'jira-open-issue',
    title: 'Open issue workflow',
    intent: 'Find, inspect, or prepare updates for Jira issues.',
    risk: 'medium',
    requiresApproval: true,
    steps: [
      `Observe issue or project page with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer issue key search and project navigation',
      'Request approval before transitions, edits, comments, or assignments'
    ]
  }],
  locators: [{
    id: 'jira-search',
    label: 'Jira search',
    selectors: ['input[aria-label*="Search"]', '[data-testid*="search"] input'],
    fallbackText: ['Search'],
    risk: 'low'
  }]
});
