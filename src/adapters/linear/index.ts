import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const linearAdapter = createSiteAdapter({
  id: 'linear',
  label: 'Linear',
  domains: ['linear.app'],
  workflows: [{
    id: 'linear-open-issue',
    title: 'Open issue workflow',
    intent: 'Find or inspect Linear issues and projects.',
    risk: 'medium',
    requiresApproval: true,
    steps: [
      `Observe workspace with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer command menu/search and issue identifiers',
      'Request approval before creating, assigning, or moving issues'
    ]
  }],
  locators: [{
    id: 'linear-command-menu',
    label: 'Command menu',
    selectors: ['[aria-label*="Command"]', '[placeholder*="Search"]'],
    fallbackText: ['Search', 'Command'],
    risk: 'low'
  }]
});
