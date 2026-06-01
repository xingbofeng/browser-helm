import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const gmailAdapter = createSiteAdapter({
  id: 'gmail',
  label: 'Gmail',
  domains: ['mail.google.com'],
  workflows: [{
    id: 'gmail-search-mail',
    title: 'Search mail workflow',
    intent: 'Search and inspect Gmail messages without sending mail by default.',
    risk: 'medium',
    requiresApproval: true,
    steps: [
      `Observe inbox state with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer the Gmail search box and message list landmarks',
      'Request approval before sending, deleting, archiving, or marking messages'
    ]
  }],
  locators: [{
    id: 'gmail-search-box',
    label: 'Search mail',
    selectors: ['input[aria-label="Search mail"]', 'input[placeholder*="Search"]'],
    fallbackText: ['Search mail'],
    risk: 'low'
  }]
});
