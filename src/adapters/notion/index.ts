import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const notionAdapter = createSiteAdapter({
  id: 'notion',
  label: 'Notion',
  domains: ['notion.so', 'notion.site'],
  workflows: [{
    id: 'notion-open-page',
    title: 'Open page workflow',
    intent: 'Find and read a Notion page or database view.',
    risk: 'low',
    requiresApproval: false,
    steps: [
      `Observe page content with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer sidebar/page title/search landmarks',
      'Fall back to visible text reading for long pages'
    ]
  }],
  locators: [{
    id: 'notion-sidebar-search',
    label: 'Sidebar search',
    selectors: ['[aria-label*="Search"]', '[placeholder*="Search"]'],
    fallbackText: ['Search'],
    risk: 'low'
  }]
});
