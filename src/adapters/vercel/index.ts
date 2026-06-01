import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const vercelAdapter = createSiteAdapter({
  id: 'vercel',
  label: 'Vercel',
  domains: ['vercel.com'],
  workflows: [{
    id: 'vercel-open-project',
    title: 'Open project workflow',
    intent: 'Find Vercel projects, deployments, domains, or environment settings.',
    risk: 'medium',
    requiresApproval: true,
    steps: [
      `Observe dashboard page with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer project switcher, deployment list, and domain/settings tabs',
      'Request approval before changing domains, env vars, protection, or deployment settings'
    ]
  }],
  locators: [{
    id: 'vercel-project-search',
    label: 'Project search',
    selectors: ['input[placeholder*="Search"]', '[aria-label*="Search"]'],
    fallbackText: ['Search'],
    risk: 'low'
  }]
});
