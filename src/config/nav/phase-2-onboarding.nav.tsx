import type { NavSection } from './types';

// Phase 2 owns this nav file.
// - "People" → admin people dashboard.
// - "My Onboarding" → employee's own onboarding checklist.
export const phase2OnboardingNav: NavSection[] = [
  {
    id: 'phase-2-onboarding',
    title: 'People & Onboarding',
    items: [
      {
        label: 'People',
        href: '/dashboard/people',
        roles: ['super_admin', 'admin', 'hr', 'manager'],
      },
      {
        label: 'My Onboarding',
        href: '/dashboard/onboarding',
        roles: ['super_admin', 'admin', 'hr', 'manager', 'employee'],
      },
    ],
  },
];
