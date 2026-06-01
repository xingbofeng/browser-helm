import { TOOL_NAMES } from '../../shared/constants/tool-names';
import { createSiteAdapter } from '../site-adapter-factory';

export const stripeAdapter = createSiteAdapter({
  id: 'stripe',
  label: 'Stripe',
  domains: ['dashboard.stripe.com', 'stripe.com'],
  workflows: [{
    id: 'stripe-open-customer',
    title: 'Open customer workflow',
    intent: 'Find billing, customer, payment, or invoice records in Stripe.',
    risk: 'high',
    requiresApproval: true,
    steps: [
      `Observe dashboard state with ${TOOL_NAMES.PAGE_OBSERVE}`,
      'Prefer dashboard search and resource navigation',
      'Request approval before refunds, cancellations, payment changes, or invoice sends'
    ]
  }],
  locators: [{
    id: 'stripe-dashboard-search',
    label: 'Dashboard search',
    selectors: ['input[placeholder*="Search"]', '[aria-label*="Search"]'],
    fallbackText: ['Search'],
    risk: 'low'
  }]
});
