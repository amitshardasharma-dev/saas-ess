// src/config/nav/core.nav.tsx
//
// Core navigation — the modules that shipped before Phase 1. This mirrors the
// previous hard-coded sidebar EXACTLY (same hrefs, titles, descriptions, icons,
// module gating, role gating, and sub-items) so behavior is preserved after the
// registry refactor. No phase edits this file except to fix a regression.

import {
	LayoutDashboard,
	Calendar,
	Receipt,
	FileText,
	User as UserIcon,
	History,
	Clock,
	Settings,
	Timer,
	FolderOpen,
	Star,
	FileSignature,
	CalendarDays,
	Users,
} from 'lucide-react'
import type { NavSection } from './types'

export const coreNav: NavSection[] = [
	{
		id: 'dashboard',
		order: 0,
		item: {
			key: 'dashboard',
			title: 'Dashboard',
			href: '/dashboard',
			icon: LayoutDashboard,
			description: 'Overview and statistics',
		},
	},
	{
		id: 'leave',
		order: 10,
		moduleId: 'leave',
		item: {
			key: 'leave',
			title: 'Leave',
			href: '/dashboard/leave-applications',
			icon: Calendar,
			description: 'Apply and manage leave',
		},
		items: [
			{
				key: 'pending-approvals',
				title: 'Pending Approvals',
				href: '/dashboard/pending-approvals',
				icon: Clock,
				description: 'Review leave approvals',
				visibleWhen: ({ hasLeaveApprovalAccess }) => hasLeaveApprovalAccess,
			},
			{
				key: 'approval-history',
				title: 'Approval History',
				href: '/dashboard/approval-history',
				icon: History,
				description: 'View approval history',
				visibleWhen: ({ hasLeaveApprovalAccess }) => hasLeaveApprovalAccess,
			},
			{
				key: 'team-calendar',
				title: 'Team Calendar',
				href: '/dashboard/team-calendar',
				icon: CalendarDays,
				description: 'Team leave calendar',
				minRole: 'manager',
			},
			{
				key: 'team-balances',
				title: 'Team Balances',
				href: '/dashboard/team-balances',
				icon: Users,
				description: 'Staff leave balances',
				minRole: 'manager',
			},
		],
	},
	{
		id: 'expense',
		order: 20,
		moduleId: 'expense',
		item: {
			key: 'expense',
			title: 'Expense Claims',
			href: '/dashboard/expense-claims',
			icon: Receipt,
			description: 'Submit and track expenses',
		},
	},
	{
		id: 'timesheets',
		order: 30,
		moduleId: 'timesheets',
		item: {
			key: 'timesheets',
			title: 'Timesheets',
			href: '/dashboard/timesheets',
			icon: Timer,
			description: 'Submit and track timesheets',
		},
		items: [
			{
				key: 'team-timesheets',
				title: 'Team Timesheets',
				href: '/dashboard/team-timesheets',
				icon: Users,
				description: 'Review team timesheets',
				minRole: 'manager',
			},
		],
	},
	{
		id: 'documents',
		order: 40,
		moduleId: 'documents',
		item: {
			key: 'documents',
			title: 'Documents',
			href: '/dashboard/documents',
			icon: FolderOpen,
			description: 'Policies & HR documents',
		},
		items: [
			{
				key: 'manage-documents',
				title: 'Manage Documents',
				href: '/dashboard/documents/manage',
				icon: FolderOpen,
				description: 'Upload and manage policies',
				minRole: 'hr',
			},
		],
	},
	{
		id: 'appraisals',
		order: 50,
		moduleId: 'appraisals',
		item: {
			key: 'appraisals',
			title: 'Appraisals',
			href: '/dashboard/appraisals',
			icon: Star,
			description: 'Performance reviews',
		},
		items: [
			{
				key: 'manage-cycles',
				title: 'Manage Cycles',
				href: '/dashboard/appraisals/cycles',
				icon: Star,
				description: 'Manage appraisal cycles',
				minRole: 'hr',
			},
		],
	},
	{
		id: 'contracts',
		order: 60,
		moduleId: 'contracts',
		item: {
			key: 'my-contract',
			title: 'My Contract',
			href: '/dashboard/contracts',
			icon: FileSignature,
			description: 'View contract details',
		},
		items: [
			{
				key: 'manage-contracts',
				title: 'Manage Contracts',
				href: '/dashboard/contracts/manage',
				icon: FileSignature,
				description: 'All employee contracts',
				minRole: 'hr',
			},
		],
	},
	{
		id: 'payslips',
		order: 70,
		item: {
			key: 'payslips',
			title: 'Payslips',
			href: '/dashboard/payslips',
			icon: FileText,
			description: 'View salary statements',
		},
	},
	{
		id: 'profile',
		order: 80,
		item: {
			key: 'profile',
			title: 'Profile',
			href: '/dashboard/profile',
			icon: UserIcon,
			description: 'Account settings',
		},
	},
	{
		id: 'settings',
		order: 90,
		minRole: 'admin',
		item: {
			key: 'settings',
			title: 'Settings',
			href: '/dashboard/settings',
			icon: Settings,
			description: 'System settings',
			minRole: 'admin',
		},
	},
]
