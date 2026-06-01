import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const githubAdapter = createSiteAdapter({
  id: 'github',
  label: 'GitHub',
  domains: ['github.com'],
  workflows: [{
    id: 'github-open-issue',
    title: 'Open issue workflow',
    intent: 'Find, inspect, or create GitHub issues with repository context.',
    risk: 'medium',
    requiresApproval: true,
    steps: [
      `Observe repository page with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Use Issues navigation or known issue search fields before broad link scanning',
      'Request approval before creating or submitting an issue'
    ]
  }],
  locators: [{
    id: 'github-issues-tab',
    label: 'Issues tab',
    selectors: ['a[data-tab-item="issues-tab"]', 'a[href$="/issues"]'],
    fallbackText: ['Issues'],
    risk: 'low'
  }],
  guidance: {
    summary: 'GitHub adapter is active. Prefer repository navigation landmarks, issue/PR tabs, and GitHub search conventions before generic exploration.'
  }
});
