// src/config/nav/filter.ts
//
// Pure nav-visibility predicates shared by the sidebar and its tests.

import { hasMinRole } from '@/types/roles'
import type { ModuleId } from '@/types/roles'
import type { NavItem, NavSection, NavVisibilityExtras } from './types'

export interface NavFilterContext extends NavVisibilityExtras {
	isModuleEnabled: (id: ModuleId) => boolean
}

/** Whether a single item is visible (role + custom predicate). */
export function isNavItemVisible(item: NavItem, ctx: NavFilterContext): boolean {
	if (item.minRole && !hasMinRole(ctx.role, item.minRole)) return false
	if (item.visibleWhen && !item.visibleWhen(ctx)) return false
	return true
}

/** Whether a section is visible (module gate + section role gate). */
export function isNavSectionVisible(section: NavSection, ctx: NavFilterContext): boolean {
	if (section.moduleId && !ctx.isModuleEnabled(section.moduleId)) return false
	if (section.minRole && !hasMinRole(ctx.role, section.minRole)) return false
	return isNavItemVisible(section.item, ctx)
}

/** Visible sub-items of a section (after role + predicate filtering). */
export function visibleSubItems(section: NavSection, ctx: NavFilterContext): NavItem[] {
	return (section.items ?? []).filter(item => isNavItemVisible(item, ctx))
}
