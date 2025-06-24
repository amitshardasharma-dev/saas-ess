'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { 
	Calendar, 
	BarChart3, 
	PieChart as PieChartIcon, 
	Grid3X3, 
	Sparkles,
	Plane,
	Heart,
	User,
	Baby,
	Users,
	HeartHandshake,
	GraduationCap,
	AlertTriangle,
	Coffee,
	Stethoscope,
	Palmtree
} from 'lucide-react'
import { LeaveBalance } from '@/types/dashboard'

interface LeaveBalanceComponentProps {
	balances: LeaveBalance[]
}

type ViewMode = 'cards' | 'bar' | 'pie'

// Enhanced leave type configurations with distinct colors and icons
const leaveTypeConfig = {
	'Annual Leave': {
		icon: Plane,
		gradient: 'from-blue-500 to-blue-600',
		bg: 'bg-blue-50 dark:bg-blue-900/20',
		border: 'border-blue-200 dark:border-blue-800',
		text: 'text-blue-700 dark:text-blue-300',
		accent: '#3b82f6'
	},
	'Casual Leave': {
		icon: Coffee,
		gradient: 'from-green-500 to-green-600',
		bg: 'bg-green-50 dark:bg-green-900/20',
		border: 'border-green-200 dark:border-green-800',
		text: 'text-green-700 dark:text-green-300',
		accent: '#10b981'
	},
	'Sick Leave': {
		icon: Heart,
		gradient: 'from-red-500 to-red-600',
		bg: 'bg-red-50 dark:bg-red-900/20',
		border: 'border-red-200 dark:border-red-800',
		text: 'text-red-700 dark:text-red-300',
		accent: '#ef4444'
	},
	'Personal Leave': {
		icon: User,
		gradient: 'from-purple-500 to-purple-600',
		bg: 'bg-purple-50 dark:bg-purple-900/20',
		border: 'border-purple-200 dark:border-purple-800',
		text: 'text-purple-700 dark:text-purple-300',
		accent: '#8b5cf6'
	},
	'Maternity Leave': {
		icon: Baby,
		gradient: 'from-pink-500 to-pink-600',
		bg: 'bg-pink-50 dark:bg-pink-900/20',
		border: 'border-pink-200 dark:border-pink-800',
		text: 'text-pink-700 dark:text-pink-300',
		accent: '#ec4899'
	},
	'Paternity Leave': {
		icon: Users,
		gradient: 'from-cyan-500 to-cyan-600',
		bg: 'bg-cyan-50 dark:bg-cyan-900/20',
		border: 'border-cyan-200 dark:border-cyan-800',
		text: 'text-cyan-700 dark:text-cyan-300',
		accent: '#06b6d4'
	},
	'Compassionate Leave': {
		icon: HeartHandshake,
		gradient: 'from-rose-500 to-rose-600',
		bg: 'bg-rose-50 dark:bg-rose-900/20',
		border: 'border-rose-200 dark:border-rose-800',
		text: 'text-rose-700 dark:text-rose-300',
		accent: '#f43f5e'
	},
	'Study Leave': {
		icon: GraduationCap,
		gradient: 'from-emerald-500 to-emerald-600',
		bg: 'bg-emerald-50 dark:bg-emerald-900/20',
		border: 'border-emerald-200 dark:border-emerald-800',
		text: 'text-emerald-700 dark:text-emerald-300',
		accent: '#10b981'
	},
	'Emergency Leave': {
		icon: AlertTriangle,
		gradient: 'from-orange-500 to-orange-600',
		bg: 'bg-orange-50 dark:bg-orange-900/20',
		border: 'border-orange-200 dark:border-orange-800',
		text: 'text-orange-700 dark:text-orange-300',
		accent: '#f97316'
	},
	'Medical Leave': {
		icon: Stethoscope,
		gradient: 'from-red-400 to-red-500',
		bg: 'bg-red-50 dark:bg-red-900/20',
		border: 'border-red-200 dark:border-red-800',
		text: 'text-red-700 dark:text-red-300',
		accent: '#dc2626'
	},
	'Vacation Leave': {
		icon: Palmtree,
		gradient: 'from-teal-500 to-teal-600',
		bg: 'bg-teal-50 dark:bg-teal-900/20',
		border: 'border-teal-200 dark:border-teal-800',
		text: 'text-teal-700 dark:text-teal-300',
		accent: '#0d9488'
	}
}

// Function to get config for any leave type with fallback
const getLeaveTypeConfig = (leaveType: string, index: number) => {
	// Try exact match first
	const exactMatch = leaveTypeConfig[leaveType as keyof typeof leaveTypeConfig]
	if (exactMatch) return exactMatch

	// Try partial match for common leave types
	const lowerType = leaveType.toLowerCase()
	if (lowerType.includes('annual') || lowerType.includes('vacation')) {
		return leaveTypeConfig['Annual Leave']
	}
	if (lowerType.includes('sick') || lowerType.includes('medical')) {
		return leaveTypeConfig['Sick Leave']
	}
	if (lowerType.includes('casual')) {
		return leaveTypeConfig['Casual Leave']
	}
	if (lowerType.includes('personal')) {
		return leaveTypeConfig['Personal Leave']
	}
	if (lowerType.includes('maternity')) {
		return leaveTypeConfig['Maternity Leave']
	}
	if (lowerType.includes('paternity')) {
		return leaveTypeConfig['Paternity Leave']
	}
	if (lowerType.includes('compassionate') || lowerType.includes('bereavement')) {
		return leaveTypeConfig['Compassionate Leave']
	}
	if (lowerType.includes('study') || lowerType.includes('education')) {
		return leaveTypeConfig['Study Leave']
	}
	if (lowerType.includes('emergency')) {
		return leaveTypeConfig['Emergency Leave']
	}

	// Fallback with dynamic colors
	const colors = [
		{ gradient: 'from-indigo-500 to-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', accent: '#6366f1' },
		{ gradient: 'from-violet-500 to-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', accent: '#8b5cf6' },
		{ gradient: 'from-amber-500 to-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', accent: '#f59e0b' },
		{ gradient: 'from-lime-500 to-lime-600', bg: 'bg-lime-50 dark:bg-lime-900/20', border: 'border-lime-200 dark:border-lime-800', text: 'text-lime-700 dark:text-lime-300', accent: '#84cc16' },
		{ gradient: 'from-sky-500 to-sky-600', bg: 'bg-sky-50 dark:bg-sky-900/20', border: 'border-sky-200 dark:border-sky-800', text: 'text-sky-700 dark:text-sky-300', accent: '#0ea5e9' }
	]
	
	const colorConfig = colors[index % colors.length]
	
	return {
		icon: Calendar,
		...colorConfig
	}
}

export function LeaveBalanceComponent({ balances }: LeaveBalanceComponentProps) {
	const [viewMode, setViewMode] = useState<ViewMode>('cards')

	// Ensure balances is an array and filter out invalid entries
	const safeBalances = Array.isArray(balances) 
		? balances.filter(balance => 
			balance && 
			typeof balance === 'object' && 
			typeof balance.leaveType === 'string' &&
			typeof balance.taken === 'number' &&
			typeof balance.remaining === 'number' &&
			typeof balance.totalAllowed === 'number'
		)
		: []

	// If no valid balances, show empty state
	if (safeBalances.length === 0) {
		return (
			<div className="flowing-card p-8">
				<div className="flex items-center justify-between mb-8">
					<div className="flex items-center space-x-4">
						<div className="floating-element p-3">
							<Calendar className="h-6 w-6 text-primary" />
						</div>
						<div>
							<h2 className="text-xl font-bold text-foreground flex items-center space-x-2">
								<span>Leave Balance Overview</span>
								<Sparkles className="h-5 w-5 text-primary" />
							</h2>
							<p className="text-sm text-muted-foreground">
								Your leave entitlements and usage
							</p>
						</div>
					</div>
				</div>
				<div className="text-center py-12">
					<Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-40" />
					<p className="text-sm font-semibold text-muted-foreground mb-1">No leave balance data available</p>
					<p className="text-xs text-muted-foreground">
						Leave balance information will appear here once available
					</p>
				</div>
			</div>
		)
	}

	const chartData = safeBalances.map(balance => ({
		name: balance.leaveType,
		taken: balance.taken,
		remaining: balance.remaining,
		total: balance.totalAllowed
	}))

	const pieDataTaken = safeBalances.map((balance, index) => {
		const config = getLeaveTypeConfig(balance.leaveType, index)
		return {
			name: balance.leaveType,
			value: balance.taken,
			color: config?.accent || `hsl(${(index * 137.5) % 360}, 70%, 50%)`
		}
	})

	const pieDataRemaining = safeBalances.map((balance, index) => {
		const config = getLeaveTypeConfig(balance.leaveType, index)
		return {
			name: balance.leaveType,
			value: balance.remaining,
			color: config?.accent || `hsl(${(index * 137.5) % 360}, 70%, 50%)`
		}
	})

	const renderCardsView = () => (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6">
			{safeBalances.map((balance, index) => {
				const config = getLeaveTypeConfig(balance.leaveType, index)
				const IconComponent = config?.icon || Calendar
				const usagePercentage = (balance.taken / balance.totalAllowed) * 100
				
				return (
					<div 
						key={balance.id}
						className={`relative overflow-hidden rounded-2xl border-2 ${config?.border || 'border-gray-200'} ${config?.bg || 'bg-gray-50'} p-6 hover-lift group transition-all duration-200`}
					>
						{/* Header with Icon and Type */}
						<div className="flex items-center justify-between mb-4">
							<div className={`p-3 rounded-xl bg-gradient-to-br ${config?.gradient || 'from-gray-400 to-gray-500'} shadow-lg`}>
								<IconComponent className="h-6 w-6 text-white" />
							</div>
							<div className={`px-3 py-1 rounded-full text-xs font-bold ${config?.text || 'text-gray-700'} ${config?.bg || 'bg-gray-100'} border ${config?.border || 'border-gray-200'}`}>
								{usagePercentage.toFixed(0)}% used
							</div>
						</div>

						{/* Leave Type Title */}
						<h3 className="font-bold text-lg text-foreground mb-4 leading-tight">
							{balance.leaveType}
						</h3>

						{/* Stats Grid */}
						<div className="grid grid-cols-2 gap-4 mb-4">
							<div className="text-center">
								<div className="text-2xl font-bold text-red-600 dark:text-red-400">
									{balance.taken}
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Taken
								</div>
							</div>
							<div className="text-center">
								<div className="text-2xl font-bold text-green-600 dark:text-green-400">
									{balance.remaining}
								</div>
								<div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
									Available
								</div>
							</div>
						</div>

						{/* Progress Bar */}
						<div className="space-y-2">
							<div className="flex justify-between text-xs font-medium text-muted-foreground">
								<span>Progress</span>
								<span>{balance.taken} of {balance.totalAllowed}</span>
							</div>
							<div className="w-full bg-white dark:bg-gray-800 rounded-full h-3 shadow-inner overflow-hidden">
								<div
									className={`h-3 rounded-full bg-gradient-to-r ${config?.gradient || 'from-gray-400 to-gray-500'} transition-all duration-300 ease-out shadow-sm`}
									style={{
										width: `${Math.min(usagePercentage, 100)}%`
									}}
								/>
							</div>
						</div>

						{/* Accent Border Effect */}
						<div 
							className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
							style={{
								background: `linear-gradient(135deg, ${config?.accent || '#gray'}10, transparent 50%, ${config?.accent || '#gray'}05)`,
								boxShadow: `0 0 0 1px ${config?.accent || '#gray'}20`
							}}
						/>
					</div>
				)
			})}
		</div>
	)

	const renderBarChart = () => (
		<div className="h-80 p-4">
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={chartData}>
					<CartesianGrid strokeDasharray="3 3" className="opacity-30" />
					<XAxis 
						dataKey="name" 
						className="text-sm"
						tick={{ fontSize: 12 }}
					/>
					<YAxis className="text-sm" tick={{ fontSize: 12 }} />
					<Tooltip 
						contentStyle={{
							backgroundColor: 'rgba(255, 255, 255, 0.95)',
							border: 'none',
							borderRadius: '1rem',
							boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
							backdropFilter: 'blur(10px)'
						}}
					/>
					<Bar dataKey="taken" fill="#ef4444" name="Taken" radius={[8, 8, 0, 0]} />
					<Bar dataKey="remaining" fill="#10b981" name="Remaining" radius={[8, 8, 0, 0]} />
				</BarChart>
			</ResponsiveContainer>
		</div>
	)

	const renderPieCharts = () => (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-4">
			<div className="space-y-4">
				<h4 className="text-sm font-semibold text-center text-muted-foreground">
					Leave Days Taken
				</h4>
				<div className="h-64">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={pieDataTaken}
								cx="50%"
								cy="50%"
								outerRadius={80}
								dataKey="value"
								label={({ name, value }) => `${name}: ${value}`}
							>
								{pieDataTaken.map((entry, index) => (
									<Cell key={`cell-${index}`} fill={entry.color} />
								))}
							</Pie>
							<Tooltip 
								contentStyle={{
									backgroundColor: 'rgba(255, 255, 255, 0.95)',
									border: 'none',
									borderRadius: '1rem',
									boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
								}}
							/>
						</PieChart>
					</ResponsiveContainer>
				</div>
			</div>
			<div className="space-y-4">
				<h4 className="text-sm font-semibold text-center text-muted-foreground">
					Leave Days Remaining
				</h4>
				<div className="h-64">
					<ResponsiveContainer width="100%" height="100%">
						<PieChart>
							<Pie
								data={pieDataRemaining}
								cx="50%"
								cy="50%"
								outerRadius={80}
								dataKey="value"
								label={({ name, value }) => `${name}: ${value}`}
							>
								{pieDataRemaining.map((entry, index) => (
									<Cell key={`cell-${index}`} fill={entry.color} />
								))}
							</Pie>
							<Tooltip 
								contentStyle={{
									backgroundColor: 'rgba(255, 255, 255, 0.95)',
									border: 'none',
									borderRadius: '1rem',
									boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
								}}
							/>
						</PieChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	)

	return (
		<div className="flowing-card p-8 hover-lift">
			<div className="flex items-center justify-between mb-8">
				<div className="flex items-center space-x-4">
					<div className="floating-element p-3">
						<Calendar className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h2 className="text-xl font-bold text-foreground flex items-center space-x-2">
							<span>Leave Balance Overview</span>
							<Sparkles className="h-5 w-5 text-primary" />
						</h2>
						<p className="text-muted-foreground">
							Your time allocation across all leave types
						</p>
					</div>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant={viewMode === 'cards' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setViewMode('cards')}
						className={viewMode === 'cards' ? 'bg-gradient-to-r from-primary to-accent' : 'floating-element hover-lift'}
					>
						<Grid3X3 className="h-4 w-4" />
					</Button>
					<Button
						variant={viewMode === 'bar' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setViewMode('bar')}
						className={viewMode === 'bar' ? 'bg-gradient-to-r from-primary to-accent' : 'floating-element hover-lift'}
					>
						<BarChart3 className="h-4 w-4" />
					</Button>
					<Button
						variant={viewMode === 'pie' ? 'default' : 'outline'}
						size="sm"
						onClick={() => setViewMode('pie')}
						className={viewMode === 'pie' ? 'bg-gradient-to-r from-primary to-accent' : 'floating-element hover-lift'}
					>
						<PieChartIcon className="h-4 w-4" />
					</Button>
				</div>
			</div>
			<div>
				{viewMode === 'cards' && renderCardsView()}
				{viewMode === 'bar' && renderBarChart()}
				{viewMode === 'pie' && renderPieCharts()}
			</div>
		</div>
	)
} 