'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useEmployee } from '@/hooks/use-employee'
import toast from 'react-hot-toast'
import { 
	LayoutDashboard, 
	Calendar, 
	Receipt, 
	FileText, 
	User as UserIcon, 
	ChevronLeft, 
	ChevronRight,
	ChevronDown,
	ChevronUp,
	Building,
	LogOut,
	History,
	Clock,
	Settings
} from 'lucide-react'

interface SidebarProps {
	className?: string
}

interface NavigationItem {
	title: string
	href?: string
	icon: any
	description: string
	subItems?: NavigationItem[]
}

export function Sidebar({ className }: SidebarProps) {
	const [isCollapsed, setIsCollapsed] = useState(false)
	const [expandedMenus, setExpandedMenus] = useState<string[]>(['leave-applications']) // Default expand Leave Applications
	const pathname = usePathname()
	const router = useRouter()
	const { logout } = useAuthStore()
	const { hasLeaveApprovalAccess, loading: employeeLoading } = useEmployee()

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

	// Create navigation structure with conditional approval items
	const getNavigationItems = (): NavigationItem[] => {
		const approvalSubItems = !employeeLoading && hasLeaveApprovalAccess ? [
			{
				title: 'Pending Approvals',
				href: '/dashboard/pending-approvals',
				icon: Clock,
				description: 'Review leave approvals'
			},
			{
				title: 'Approval History',
				href: '/dashboard/approval-history',
				icon: History,
				description: 'View approval history'
			}
		] : []

		return [
			{
				title: 'Dashboard',
				href: '/dashboard',
				icon: LayoutDashboard,
				description: 'Overview and statistics'
			},
			{
				title: 'Leave Applications',
				href: '/dashboard/leave-applications',
				icon: Calendar,
				description: 'Apply and manage leave',
				subItems: approvalSubItems
			},
			{
				title: 'Expense Claims',
				href: '/dashboard/expense-claims',
				icon: Receipt,
				description: 'Submit and track expenses'
			},
			{
				title: 'Payslips',
				href: '/dashboard/payslips',
				icon: FileText,
				description: 'View salary statements'
			},
			{
				title: 'Profile',
				href: '/dashboard/profile',
				icon: UserIcon,
				description: 'Account settings'
			},
			{
				title: 'System Settings',
				href: '/dashboard/settings',
				icon: Settings,
				description: 'System settings'
			}
		]
	}

	const renderNavigationItem = (item: NavigationItem, level: number = 0) => {
		const IconComponent = item.icon
		const hasSubItems = item.subItems && item.subItems.length > 0
		const isExpanded = expandedMenus.includes(item.title.toLowerCase().replace(' ', '-'))
		const isActive = pathname === item.href
		const isSubItemActive = item.subItems?.some(subItem => pathname === subItem.href)
		const shouldHighlight = isActive || isSubItemActive

		return (
			<div key={item.title}>
				{/* Main Item */}
				<div className={cn(
					"group flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover-lift cursor-pointer",
					shouldHighlight 
						? "bg-primary text-primary-foreground shadow-sm" 
						: "hover:bg-accent hover:text-accent-foreground",
					isCollapsed && "justify-center",
					level > 0 && "ml-4 pl-6" // Indent sub-items
				)}
				onClick={() => {
					if (hasSubItems && !isCollapsed) {
						toggleMenu(item.title.toLowerCase().replace(' ', '-'))
					}
					if (item.href) {
						router.push(item.href)
					}
				}}
				>
					<IconComponent className={cn(
						"h-5 w-5 shrink-0",
						shouldHighlight ? "text-primary-foreground" : "text-muted-foreground group-hover:text-accent-foreground",
						level > 0 && "h-4 w-4" // Smaller icons for sub-items
					)} />
					
					{!isCollapsed && (
						<div className="flex-1 min-w-0">
							<div className={cn(
								"font-medium text-sm truncate",
								shouldHighlight ? "text-primary-foreground" : "text-foreground",
								level > 0 && "text-xs" // Smaller text for sub-items
							)}>
								{item.title}
							</div>
							<div className={cn(
								"text-xs truncate",
								shouldHighlight ? "text-primary-foreground/80" : "text-muted-foreground",
								level > 0 && "text-xs opacity-75" // More subtle description for sub-items
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
						{item.subItems!.map(subItem => (
							<Link key={subItem.href} href={subItem.href!}>
								<div className={cn(
									"group flex items-center space-x-3 px-3 py-2 ml-6 rounded-lg transition-all duration-200 hover-lift",
									pathname === subItem.href
										? "bg-primary/10 text-primary border-l-2 border-primary" 
										: "hover:bg-accent/50 hover:text-accent-foreground"
								)}>
									<subItem.icon className={cn(
										"h-4 w-4 shrink-0",
										pathname === subItem.href ? "text-primary" : "text-muted-foreground group-hover:text-accent-foreground"
									)} />
									
									<div className="flex-1 min-w-0">
										<div className={cn(
											"font-medium text-xs truncate",
											pathname === subItem.href ? "text-primary" : "text-foreground"
										)}>
											{subItem.title}
										</div>
										<div className={cn(
											"text-xs truncate opacity-75",
											pathname === subItem.href ? "text-primary/70" : "text-muted-foreground"
										)}>
											{subItem.description}
										</div>
									</div>

									{/* Active indicator for sub-items */}
									{pathname === subItem.href && (
										<div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
									)}
								</div>
							</Link>
						))}
					</div>
				)}
			</div>
		)
	}

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
							<div className="floating-element p-2">
								<Building className="h-5 w-5 text-primary" />
							</div>
							<div>
								<h2 className="font-bold text-sm text-foreground">ESS Portal</h2>
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
				{getNavigationItems().map(item => renderNavigationItem(item))}
			</nav>

			{/* Footer with Logout */}
			<div className="p-4 border-t border-border space-y-3">
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
									href="https://techmeridian.in" 
									target="_blank" 
									rel="noopener noreferrer"
									className="text-primary hover:text-primary/80 font-medium transition-colors"
								>
									techmeridian.in
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