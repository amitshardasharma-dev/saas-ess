'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useEmployee } from '@/hooks/use-employee'
import { useModules } from '@/hooks/use-modules'
import { useBranding } from '@/hooks/use-branding'
import { useLabels } from '@/hooks/use-labels'
import { UserRole } from '@/types/roles'
import { navRegistry } from '@/config/navigation'
import { isNavSectionVisible, visibleSubItems, type NavFilterContext } from '@/config/nav/filter'
import type { NavItem } from '@/config/nav/types'
import toast from 'react-hot-toast'
import {
	ChevronLeft,
	ChevronRight,
	ChevronDown,
	ChevronUp,
	Building,
	LogOut,
	Shield,
} from 'lucide-react'

interface SidebarProps {
	className?: string
}

export function Sidebar({ className }: SidebarProps) {
	const [isCollapsed, setIsCollapsed] = useState(false)
	const [expandedMenus, setExpandedMenus] = useState<string[]>(['leave', 'timesheets']) // Default expand Leave & Timesheets
	const pathname = usePathname()
	const router = useRouter()
	const { logout, user } = useAuthStore()
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()
	const { isModuleEnabled, loading: modulesLoading } = useModules()
	const branding = useBranding()
	const { t } = useLabels()
	const userRole = (user?.role || 'employee') as UserRole

	const toggleSidebar = () => {
		setIsCollapsed(!isCollapsed)
	}

	const toggleMenu = (menuKey: string) => {
		setExpandedMenus(prev =>
			prev.includes(menuKey)
				? prev.filter(key => key !== menuKey)
				: [...prev, menuKey]
		)
	}

	// Auto-expand parent menus when a sub-item route is active
	useEffect(() => {
		const subItemRoutes: Record<string, string> = {
			'/dashboard/pending-approvals': 'leave',
			'/dashboard/approval-history': 'leave',
			'/dashboard/team-calendar': 'leave',
			'/dashboard/team-balances': 'leave',
			'/dashboard/team-timesheets': 'timesheets',
			'/dashboard/documents/manage': 'documents',
			'/dashboard/appraisals/cycles': 'appraisals',
			'/dashboard/contracts/manage': 'my-contract',
		}
		const parentKey = subItemRoutes[pathname]
		if (parentKey && !expandedMenus.includes(parentKey)) {
			setExpandedMenus(prev => [...prev, parentKey])
		}
	}, [pathname])

	const handleLogout = async () => {
		try {
			await logout()
			toast.success('Logged out successfully')
			router.push('/login')
		} catch (error) {
			console.error('Logout error:', error)
			toast.error('Failed to logout')
		}
	}

	// Visibility context for the registry filter. Sub-items that depend on
	// leave-approval access are hidden until the employee record has loaded
	// (matches the previous `!employeeLoading && hasLeaveApprovalAccess` gate).
	const filterCtx: NavFilterContext = {
		role: userRole,
		hasLeaveApprovalAccess: !employeeLoading && hasLeaveApprovalAccess,
		isSuperAdmin: Boolean(user?.is_super_admin),
		isModuleEnabled,
	}

	// Resolve an item's display title: terminology key (plural) wins over static.
	const titleFor = (item: NavItem): string =>
		item.titleKey ? t(item.titleKey, { plural: true }) : item.title ?? ''

	const renderSubItem = (item: NavItem) => (
		<Link key={item.href} href={item.href}>
			<div className={cn(
				"group flex items-center space-x-3 px-3 py-2 ml-6 rounded-lg transition-all duration-200 hover-lift",
				pathname === item.href
					? "bg-primary/10 text-primary border-l-2 border-primary"
					: "hover:bg-accent/50 hover:text-accent-foreground"
			)}>
				<item.icon className={cn(
					"h-4 w-4 shrink-0",
					pathname === item.href ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground"
				)} />

				<div className="flex-1 min-w-0">
					<div className={cn(
						"font-medium text-xs truncate",
						pathname === item.href ? "text-primary" : "text-foreground"
					)}>
						{titleFor(item)}
					</div>
					<div className={cn(
						"text-xs truncate opacity-75",
						pathname === item.href ? "text-primary/70" : "text-muted-foreground"
					)}>
						{item.description}
					</div>
				</div>

				{/* Active indicator for sub-items */}
				{pathname === item.href && (
					<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
				)}
			</div>
		</Link>
	)

	return (
		<div className={cn(
			"relative flex flex-col h-screen bg-background/50 backdrop-blur-xl border-r border-border transition-all duration-300",
			isCollapsed ? "w-16" : "w-64",
			className
		)}>
			{/* Header */}
			<div className="p-4 border-b border-border">
				<div className="flex items-center justify-between">
					{!isCollapsed && (
						<div className="flex items-center space-x-3">
							<div className="floating-element flex h-9 w-9 items-center justify-center overflow-hidden p-1">
								{branding.logoUrl ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img src={branding.logoUrl} alt={branding.name} className="h-full w-full object-contain" />
								) : (
									<Building className="h-5 w-5 text-primary" />
								)}
							</div>
							<div className="min-w-0">
								<h2 className="truncate font-bold text-sm text-foreground">{branding.name}</h2>
								<p className="text-xs text-muted-foreground">Employee Self Service</p>
							</div>
						</div>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={toggleSidebar}
						className="h-8 w-8 p-0 hover-lift"
					>
						{isCollapsed ? (
							<ChevronRight className="h-4 w-4" />
						) : (
							<ChevronLeft className="h-4 w-4" />
						)}
					</Button>
				</div>
			</div>

			{/* Navigation */}
			<nav className="flex-1 p-4 space-y-2 overflow-y-auto">
				{modulesLoading ? (
					/* Fresh session with no cached module set yet: render a skeleton for
					   the whole nav rather than the ungated items alone, so the full menu
					   appears in one paint instead of the rest popping in a moment later. */
					Array.from({ length: 9 }).map((_, i) => (
						<div key={`skeleton-${i}`} className="flex items-center space-x-3 px-3 py-2.5">
							<div className="h-5 w-5 shrink-0 rounded-md bg-muted animate-pulse" />
							{!isCollapsed && (
								<div className="flex-1 min-w-0 space-y-1.5">
									<div className="h-3 w-24 rounded bg-muted animate-pulse" />
									<div className="h-2 w-16 rounded bg-muted/60 animate-pulse" />
								</div>
							)}
						</div>
					))
				) : (
					navRegistry
					.filter(section => isNavSectionVisible(section, filterCtx))
					.map(section => {
						const item = section.item
						const subItems = visibleSubItems(section, filterCtx)
						const hasSubItems = subItems.length > 0
						const IconComponent = item.icon
						const menuKey = item.key
						const isExpanded = expandedMenus.includes(menuKey)
						const isActive = pathname === item.href
						const isSubItemActive = subItems.some(sub => pathname === sub.href)
						const shouldHighlight = isActive || isSubItemActive

						return (
							<div key={section.id}>
								{/* Main Item */}
								<div className={cn(
									"group flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover-lift cursor-pointer",
									shouldHighlight
										? "bg-primary text-primary-foreground shadow-sm"
										: "hover:bg-accent hover:text-accent-foreground",
									isCollapsed && "justify-center"
								)}
								onClick={() => {
									if (hasSubItems && !isCollapsed) {
										toggleMenu(menuKey)
									}
									if (item.href) {
										router.push(item.href)
									}
								}}
								>
									<IconComponent className={cn(
										"h-5 w-5 shrink-0",
										shouldHighlight ? "text-primary-foreground" : "text-muted-foreground group-hover:text-accent-foreground"
									)} />

									{!isCollapsed && (
										<div className="flex-1 min-w-0">
											<div className={cn(
												"font-medium text-sm truncate",
												shouldHighlight ? "text-primary-foreground" : "text-foreground"
											)}>
												{titleFor(item)}
											</div>
											<div className={cn(
												"text-xs truncate",
												shouldHighlight ? "text-primary-foreground/80" : "text-muted-foreground"
											)}>
												{item.description}
											</div>
										</div>
									)}

									{/* Expand/Collapse Icon for items with sub-items */}
									{hasSubItems && !isCollapsed && (
										<div className="shrink-0">
											{isExpanded ? (
												<ChevronUp className="h-4 w-4" />
											) : (
												<ChevronDown className="h-4 w-4" />
											)}
										</div>
									)}

									{/* Active indicator */}
									{shouldHighlight && (
										<div className="w-2 h-2 rounded-full bg-primary-foreground shrink-0" />
									)}
								</div>

								{/* Sub Items */}
								{hasSubItems && isExpanded && !isCollapsed && (
									<div className="mt-1 space-y-1">
										{subItems.map(renderSubItem)}
									</div>
								)}
							</div>
						)
					})
				)}
			</nav>

			{/* Footer with Logout */}
			<div className="p-4 border-t border-border space-y-3">
				{user?.is_super_admin && (
					<Link href="/platform">
						<div className={cn(
							"flex items-center space-x-3 px-3 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition-all mb-2",
							isCollapsed && "justify-center"
						)}>
							<Shield className="h-5 w-5" />
							{!isCollapsed && (
								<div>
									<div className="font-medium text-sm">Platform Admin</div>
									<div className="text-xs opacity-75">Super admin panel</div>
								</div>
							)}
						</div>
					</Link>
				)}
				{/* Logout Button */}
				<Button
					variant="outline"
					size={isCollapsed ? "sm" : "default"}
					onClick={handleLogout}
					className={cn(
						"w-full hover-lift transition-all duration-200",
						isCollapsed ? "h-10 w-10 p-0" : "justify-start"
					)}
				>
					<LogOut className={cn("h-4 w-4", !isCollapsed && "mr-2")} />
					{!isCollapsed && <span>Logout</span>}
				</Button>

				{/* System Footer */}
				{!isCollapsed && (
					<div className="px-3 py-2 text-center">
						<div className="text-xs text-muted-foreground leading-relaxed">
							<div className="font-semibold text-foreground mb-1">ESS System</div>
							<div>
								Powered by{' '}
								<a
									href="https://ess.mosping.com"
									target="_blank"
									rel="noopener noreferrer"
									className="text-primary hover:text-primary/80 font-medium transition-colors"
								>
									ess.mosping.com
								</a>
							</div>
						</div>
					</div>
				)}
			</div>

			{/* Tooltip for collapsed state */}
			{isCollapsed && (
				<div className="absolute left-full top-0 h-full w-4 pointer-events-none" />
			)}
		</div>
	)
}
