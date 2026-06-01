import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const supabaseAdapter = createSiteAdapter({
  id: 'supabase',
  label: 'Supabase',
  domains: ['supabase.com', 'app.supabase.com'],
  workflows: [{
    id: 'supabase-open-project',
    title: 'Open project workflow',
    intent: 'Find Supabase projects, database tables, SQL editor, auth, or storage views.',
    risk: 'high',
    requiresApproval: true,
    steps: [
      `Observe project dashboard with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer project sidebar sections and table/search controls',
      'Request approval before SQL execution, policy changes, auth changes, or storage mutation'
    ]
  }],
  locators: [{
    id: 'supabase-sidebar',
    label: 'Project sidebar',
    selectors: ['nav a', '[data-testid*="nav"] a'],
    fallbackText: ['Table Editor', 'SQL Editor', 'Authentication'],
    risk: 'low'
  }]
});
