'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import toast from 'react-hot-toast'
import { 
	LayoutDashboard, 
	Calendar, 
	Receipt, 
	FileText, 
	User as UserIcon, 
	ChevronLeft, 
	ChevronRight,
	Building,
	LogOut,
	History
} from 'lucide-react'

interface SidebarProps {
	className?: string
}

const navigationItems = [
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
		description: 'Apply and manage leave'
	},
	{
		title: 'Pending Approvals',
		href: '/dashboard/pending-approvals',
		icon: FileText,
		description: 'Review leave approvals'
	},
	{
		title: 'Approval History',
		href: '/dashboard/approval-history',
		icon: History,
		description: 'View approval history'
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
	}
]

export function Sidebar({ className }: SidebarProps) {
	const [isCollapsed, setIsCollapsed] = useState(false)
	const pathname = usePathname()
	const router = useRouter()
	const { user, logout } = useAuthStore()

	const toggleSidebar = () => {
		setIsCollapsed(!isCollapsed)
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
				{navigationItems.map((item) => {
					const IconComponent = item.icon
					const isActive = pathname === item.href
					
					return (
						<Link key={item.href} href={item.href}>
							<div className={cn(
								"group flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover-lift",
								isActive 
									? "bg-primary text-primary-foreground shadow-sm" 
									: "hover:bg-accent hover:text-accent-foreground",
								isCollapsed && "justify-center"
							)}>
								<IconComponent className={cn(
									"h-5 w-5 shrink-0",
									isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-accent-foreground"
								)} />
								
								{!isCollapsed && (
									<div className="flex-1 min-w-0">
										<div className={cn(
											"font-medium text-sm truncate",
											isActive ? "text-primary-foreground" : "text-foreground"
										)}>
											{item.title}
										</div>
										<div className={cn(
											"text-xs truncate",
											isActive ? "text-primary-foreground/80" : "text-muted-foreground"
										)}>
											{item.description}
										</div>
									</div>
								)}

								{/* Active indicator */}
								{isActive && (
									<div className="w-2 h-2 rounded-full bg-primary-foreground shrink-0" />
								)}
							</div>
						</Link>
					)
				})}
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