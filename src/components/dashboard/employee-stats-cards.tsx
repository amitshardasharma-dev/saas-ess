'use client'

import { Calendar, Clock, CheckCircle, TrendingUp, Star } from 'lucide-react'
import { EmployeeDashboardStats } from '@/types/dashboard'

interface EmployeeStatsCardsProps {
	stats: EmployeeDashboardStats
}

export function EmployeeStatsCards({ stats }: EmployeeStatsCardsProps) {
	const metrics = [
		{
			title: "Pending Leave",
			value: stats.myPendingLeaveApplications,
			subtitle: "Awaiting approval",
			icon: Clock,
			color: "from-amber-400 to-amber-600",
			bgColor: "bg-amber-50 dark:bg-amber-900/20",
			textColor: "text-amber-700 dark:text-amber-300"
		},
		{
			title: "Pending Expenses",
			value: stats.myPendingExpenseClaims,
			subtitle: "Under review",
			icon: Clock,
			color: "from-blue-400 to-blue-600",
			bgColor: "bg-blue-50 dark:bg-blue-900/20",
			textColor: "text-blue-700 dark:text-blue-300"
		},
		{
			title: "Leave Taken",
			value: stats.totalLeaveTaken,
			subtitle: "Days this year",
			icon: Calendar,
			color: "from-red-400 to-red-600",
			bgColor: "bg-red-50 dark:bg-red-900/20",
			textColor: "text-red-700 dark:text-red-300"
		},
		{
			title: "Leave Remaining",
			value: stats.totalLeaveRemaining,
			subtitle: "Days available",
			icon: CheckCircle,
			color: "from-green-400 to-green-600",
			bgColor: "bg-green-50 dark:bg-green-900/20",
			textColor: "text-green-700 dark:text-green-300"
		},
		{
			title: "Recent Apps",
			value: stats.recentApplications,
			subtitle: "Last 30 days",
			icon: TrendingUp,
			color: "from-purple-400 to-purple-600",
			bgColor: "bg-purple-50 dark:bg-purple-900/20",
			textColor: "text-purple-700 dark:text-purple-300"
		},
		{
			title: "Monthly Approved",
			value: stats.approvedThisMonth,
			subtitle: "This month",
			icon: Star,
			color: "from-teal-400 to-teal-600",
			bgColor: "bg-teal-50 dark:bg-teal-900/20",
			textColor: "text-teal-700 dark:text-teal-300"
		}
	]

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
			{metrics.map((metric) => {
				const IconComponent = metric.icon
				return (
					<div
						key={metric.title}
						className="metric-bubble hover-lift p-6 group"
					>
						{/* Floating Icon */}
						<div className="flex items-center justify-between mb-4">
							<div className={`floating-element p-3 ${metric.bgColor}`}>
								<IconComponent className={`h-5 w-5 ${metric.textColor}`} />
							</div>
							<div className="w-2 h-2 rounded-full bg-gradient-to-r opacity-60 group-hover:opacity-100 transition-opacity duration-200" 
								style={{
									background: `linear-gradient(135deg, var(--primary), var(--accent))`
								}}
							/>
						</div>

						{/* Metric Value */}
						<div className="space-y-2">
							<div className={`text-3xl font-bold bg-gradient-to-br ${metric.color} bg-clip-text text-transparent`}>
								{metric.value}
							</div>
							<div>
								<h3 className="font-semibold text-sm text-foreground mb-1">
									{metric.title}
								</h3>
								<p className="text-xs text-muted-foreground">
									{metric.subtitle}
								</p>
							</div>
						</div>

						{/* Hover Effect Accent */}
						<div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
					</div>
				)
			})}
		</div>
	)
} 