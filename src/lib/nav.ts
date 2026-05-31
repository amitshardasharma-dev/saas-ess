// Navigation registry. Each phase appends its dashboard entries under the
// phase marker below so merges stay conflict-free.

export interface NavItem {
  /** Stable id used for active-state matching. */
  id: string;
  /** Route path. */
  href: string;
  /** Label key resolved via getLabels/useLabels (falls back to `fallback`). */
  labelKey: string;
  /** Human-readable fallback when no label override is registered. */
  fallback: string;
  /** Module key that must be enabled for this entry to render. */
  moduleKey?: string;
}

export const NAV_ITEMS: NavItem[] = [
  // === PHASE-3 NAV ===
  // PHASE-3 ENTRIES
  {
    id: 'compliance',
    href: '/dashboard/compliance',
    labelKey: 'compliance',
    fallback: 'Compliance',
    moduleKey: 'compliance',
  },
];

export function getNavItems(): NavItem[] {
  return NAV_ITEMS;
}
