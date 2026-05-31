// src/config/nav/types.ts
//
// Navigation registry types (Phase 1 published contract). Phases contribute
// NavSection[] to src/config/navigation.ts; the sidebar renders from the
// registry, filtering by module-enabled state + role and resolving labels via
// the terminology system.

import type { ComponentType } from 'react'
import type { ModuleId, UserRole } from '@/types/roles'
import type { TermKey } from '@/lib/labels/defaults'

export interface NavItem {
  /** Stable key (also the React key). */
  key: string
  /** Static display title. Provide either `title` or `titleKey`. */
  title?: string
  /** Terminology key whose resolved (plural) value is the title. Wins over `title`. */
  titleKey?: TermKey
  href: string
  /** Lucide icon component. */
  icon: ComponentType<{ className?: string }>
  /** Short description shown under the title (existing sidebar look). */
  description?: string
  /** Minimum role required to see this item. */
  minRole?: UserRole
  /** Custom visibility predicate (e.g. leave-approval access). */
  visibleWhen?: (ctx: NavVisibilityExtras) => boolean
}

export interface NavSection {
  /** Stable id (also the React key). */
  id: string
  /** Module that gates this whole section. Omit for always-visible sections. */
  moduleId?: ModuleId
  /** Minimum role required to see the section header item. */
  minRole?: UserRole
  /** Sort weight; lower renders first. Core sections occupy 0-99. */
  order: number
  /** Section header / top-level item. */
  item: NavItem
  /** Nested items (rendered as sub-items, preserving existing behavior). */
  items?: NavItem[]
}

/** Extra context passed to `visibleWhen` predicates. */
export interface NavVisibilityExtras {
  role: UserRole
  hasLeaveApprovalAccess: boolean
  isSuperAdmin: boolean
}
