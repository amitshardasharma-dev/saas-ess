import { 
	MyLeaveApplication, 
	MyExpenseClaim, 
	LeaveBalance, 
	EmployeeDashboardStats,
	LeaveTypeData,
	PayslipData,
	FrappeLeaveTypeData,
	FrappeLeaveAllocationData,
	FrappeLeaveApplicationData
} from '@/types/dashboard'

// Color mapping for different leave types
const leaveTypeColors: Record<string, string> = {
	'Annual Leave': '#3b82f6',
	'Sick Leave': '#ef4444',
	'Personal Leave': '#8b5cf6',
	'Maternity Leave': '#ec4899',
	'Paternity Leave': '#06b6d4',
	'Compassionate Leave': '#f59e0b',
	'Study Leave': '#10b981',
	'Emergency Leave': '#f97316',
	'Casual Leave': '#6366f1',
	'Medical Leave': '#dc2626',
	'Bereavement Leave': '#78716c',
	'Marriage Leave': '#f472b6',
	'Vacation Leave': '#0ea5e9',
	'Unpaid Leave': '#64748b'
}

// Function to get color for leave type
const getLeaveTypeColor = (leaveType: string): string => {
	return leaveTypeColors[leaveType] || '#6b7280' // Default gray color
}

// Function to fetch leave types from Frappe
const fetchLeaveTypes = async (): Promise<FrappeLeaveTypeData[]> => {
	try {
		const response = await fetch('/api/leave-types', {
			credentials: 'include',
		})

		if (!response.ok) {
			if (response.status === 401) {
				console.log('Authentication required for leave types')
				return []
			}
			if (response.status === 403) {
				console.log('Access denied to leave types')
				return []
			}
			throw new Error(`Failed to fetch leave types: ${response.status}`)
		}

		const data = await response.json()
		
		// Ensure we have the expected data structure
		if (typeof data !== 'object' || data === null) {
			console.error('Invalid response format from leave types API:', data)
			return []
		}
		
		// Check if the response contains error fields that might be rendered
		if (data.message && data.workflow_state) {
			console.error('API returned error object instead of data:', data)
			return []
		}
		
		return Array.isArray(data.leave_types) ? data.leave_types : []
	} catch (error) {
		console.error('Error fetching leave types:', error)
		return []
	}
}

// Function to fetch leave allocations from Frappe
const fetchLeaveAllocations = async (): Promise<FrappeLeaveAllocationData[]> => {
	try {
		const response = await fetch('/api/leave-allocations', {
			credentials: 'include',
		})

		if (!response.ok) {
			if (response.status === 401) {
				console.log('Authentication required for leave allocations')
				return []
			}
			if (response.status === 403) {
				console.log('Access denied to leave allocations')
				return []
			}
			throw new Error(`Failed to fetch leave allocations: ${response.status}`)
		}

		const data = await response.json()
		return data.leave_allocations || []
	} catch (error) {
		console.error('Error fetching leave allocations:', error)
		return []
	}
}

// Function to fetch leave applications from Frappe
const fetchLeaveApplications = async (): Promise<{ applications: FrappeLeaveApplicationData[], summary: { [leaveType: string]: number }, pendingCount: number }> => {
	try {
		const response = await fetch('/api/leave-applications')
		
		if (!response.ok) {
			if (response.status === 401) {
				console.log('Authentication required for leave applications')
				return { applications: [], summary: {}, pendingCount: 0 }
			}
			if (response.status === 403) {
				console.log('Access denied to leave applications')
				return { applications: [], summary: {}, pendingCount: 0 }
			}
			throw new Error(`Failed to fetch leave applications: ${response.status}`)
		}

		const data = await response.json()
		
		// Ensure we have the expected data structure
		if (typeof data !== 'object' || data === null) {
			console.error('Invalid response format from leave applications API:', data)
			return { applications: [], summary: {}, pendingCount: 0 }
		}
		
		// Check if the response contains error fields that might be rendered
		if (data.message && data.workflow_state) {
			console.error('API returned error object instead of data:', data)
			return { applications: [], summary: {}, pendingCount: 0 }
		}
		
		return {
			applications: Array.isArray(data.leave_applications) ? data.leave_applications : [],
			summary: typeof data.leave_summary === 'object' && data.leave_summary !== null ? data.leave_summary : {},
			pendingCount: typeof data.pending_count === 'number' ? data.pending_count : 0
		}
	} catch (error) {
		console.error('Error fetching leave applications:', error)
		return { applications: [], summary: {}, pendingCount: 0 }
	}
}

// Function to combine leave types and allocations into leave balances
const combineLeaveData = async (): Promise<LeaveBalance[]> => {
	try {
		const [leaveTypes, leaveApplicationsData] = await Promise.all([
			fetchLeaveTypes(),
			fetchLeaveApplications()
		])

		console.log('Fetched leave types:', leaveTypes)
		console.log('Fetched leave applications:', leaveApplicationsData.applications)
		console.log('Leave summary by type:', leaveApplicationsData.summary)

		// Use the pre-calculated leave summary from the API
		const leaveSummary = leaveApplicationsData.summary

		// Combine leave types with their taken leave counts
		const leaveBalances: LeaveBalance[] = leaveTypes.map((leaveType, index) => {
			// Try to find taken days using different matching strategies
			let takenDays = 0
			
			// Strategy 1: Direct match by leave type name (LEAVETYPE01, etc.)
			if (leaveSummary[leaveType.name]) {
				takenDays = leaveSummary[leaveType.name]
			}
			// Strategy 2: Match by leave_mapping_code
			else if (leaveType.leave_mapping_code && leaveSummary[leaveType.leave_mapping_code]) {
				takenDays = leaveSummary[leaveType.leave_mapping_code]
			}
			// Strategy 3: Match by description
			else if (leaveType.description && leaveSummary[leaveType.description]) {
				takenDays = leaveSummary[leaveType.description]
			}
			
			const totalAllowed = leaveType.eligible_days || 0
			const remaining = Math.max(0, totalAllowed - takenDays)
			
			// Use description if available, otherwise use leave_mapping_code, otherwise use name
			let displayName = leaveType.description && leaveType.description.trim() 
				? leaveType.description.trim()
				: leaveType.leave_mapping_code && leaveType.leave_mapping_code.trim()
				? leaveType.leave_mapping_code.trim()
				: leaveType.name
			
			// If displayName is still empty or just whitespace, use a fallback
			if (!displayName || displayName.trim() === '') {
				displayName = `Leave Type ${index + 1}`
			}
			
			const balance = {
				id: leaveType.name, // Use the unique name as ID
				leaveType: displayName,
				totalAllowed: totalAllowed,
				taken: takenDays,
				remaining: remaining,
				color: getLeaveTypeColor(displayName)
			}
			
			console.log(`Processing leave type: ${leaveType.name}, Display: ${displayName}, Eligible: ${totalAllowed}, Taken: ${takenDays}`)
			return balance
		})

		console.log('All leave balances before filtering:', leaveBalances)

		// Filter out leave types with 0 total allowed (unless they have taken leaves)
		// Also filter out non-leave types like "Present", "Public Holiday", "Weekoff", "Absent"
		const filteredLeaveBalances = leaveBalances.filter(balance => {
			// Filter out non-actual leave types based on leave_mapping_code
			// Use exact matching for short codes and word boundary matching for longer terms
			const nonLeaveTypes = ['Present', 'Public Holiday', 'Week Off', 'Weekoff', 'Absent']
			const nonLeaveShortCodes = ['P', 'PH', 'W/OFF']
			
			const leaveTypeLower = balance.leaveType.toLowerCase()
			
			// Check for exact matches with short codes (to avoid 'P' matching 'Paternity')
			const matchesShortCode = nonLeaveShortCodes.some(code => 
				leaveTypeLower === code.toLowerCase()
			)
			
			// Check for partial matches with longer terms
			const matchesLongerTerm = nonLeaveTypes.some(nonLeave => 
				leaveTypeLower.includes(nonLeave.toLowerCase())
			)
			
			const isNonLeaveType = matchesShortCode || matchesLongerTerm
			
			// Include if it's an actual leave type AND has eligible days > 0 OR has taken leaves
			const shouldInclude = !isNonLeaveType && (balance.totalAllowed > 0 || balance.taken > 0)
			
			return shouldInclude
		})

		console.log('Filtered leave balances:', filteredLeaveBalances)
		
		return filteredLeaveBalances
	} catch (error) {
		console.error('Error combining leave data:', error)
		// Return fallback dummy data if Frappe integration fails
		return fallbackLeaveBalances
	}
}

// Fallback dummy data (keep existing data as backup)
const fallbackLeaveBalances: LeaveBalance[] = [
	{
		id: 'annual-leave',
		leaveType: 'Annual Leave',
		totalAllowed: 25,
		taken: 12,
		remaining: 13,
		color: '#3b82f6'
	},
	{
		id: 'sick-leave',
		leaveType: 'Sick Leave',
		totalAllowed: 10,
		taken: 3,
		remaining: 7,
		color: '#ef4444'
	},
	{
		id: 'personal-leave',
		leaveType: 'Personal Leave',
		totalAllowed: 5,
		taken: 2,
		remaining: 3,
		color: '#8b5cf6'
	},
	{
		id: 'maternity-leave',
		leaveType: 'Maternity Leave',
		totalAllowed: 90,
		taken: 0,
		remaining: 90,
		color: '#ec4899'
	},
	{
		id: 'paternity-leave',
		leaveType: 'Paternity Leave',
		totalAllowed: 15,
		taken: 0,
		remaining: 15,
		color: '#06b6d4'
	},
	{
		id: 'compassionate-leave',
		leaveType: 'Compassionate Leave',
		totalAllowed: 3,
		taken: 1,
		remaining: 2,
		color: '#f59e0b'
	},
	{
		id: 'study-leave',
		leaveType: 'Study Leave',
		totalAllowed: 10,
		taken: 5,
		remaining: 5,
		color: '#10b981'
	},
	{
		id: 'emergency-leave',
		leaveType: 'Emergency Leave',
		totalAllowed: 5,
		taken: 1,
		remaining: 4,
		color: '#f97316'
	}
]

// Employee's own leave applications
export const myLeaveApplications: MyLeaveApplication[] = [
	{
		id: 'LA-2024-001',
		leaveType: 'Annual Leave',
		fromDate: '2024-12-20',
		toDate: '2024-12-24',
		days: 5,
		reason: 'Christmas holidays with family',
		status: 'pending',
		appliedDate: '2024-12-10'
	},
	{
		id: 'LA-2024-002',
		leaveType: 'Annual Leave',
		fromDate: '2024-11-15',
		toDate: '2024-11-18',
		days: 4,
		reason: 'Long weekend vacation',
		status: 'approved',
		appliedDate: '2024-11-01',
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-11-03'
	},
	{
		id: 'LA-2024-003',
		leaveType: 'Sick Leave',
		fromDate: '2024-10-22',
		toDate: '2024-10-23',
		days: 2,
		reason: 'Flu symptoms',
		status: 'approved',
		appliedDate: '2024-10-21',
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-10-21'
	},
	{
		id: 'LA-2024-004',
		leaveType: 'Personal Leave',
		fromDate: '2025-01-15',
		toDate: '2025-01-16',
		days: 2,
		reason: 'Personal family matters',
		status: 'rejected',
		appliedDate: '2024-12-01',
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-12-02',
		rejectionReason: 'Peak business period, please reschedule'
	}
]

// Employee's own expense claims
export const myExpenseClaims: MyExpenseClaim[] = [
	{
		id: 'EC-2024-001',
		description: 'Client lunch meeting at downtown restaurant',
		amount: 145.80,
		currency: 'USD',
		category: 'Meals & Entertainment',
		status: 'pending',
		submittedDate: '2024-12-09',
		receiptAttached: true
	},
	{
		id: 'EC-2024-002',
		description: 'Uber rides for client site visits',
		amount: 85.40,
		currency: 'USD',
		category: 'Transportation',
		status: 'approved',
		submittedDate: '2024-11-28',
		receiptAttached: true,
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-11-30'
	},
	{
		id: 'EC-2024-003',
		description: 'Office supplies for project work',
		amount: 67.25,
		currency: 'USD',
		category: 'Office Supplies',
		status: 'approved',
		submittedDate: '2024-11-15',
		receiptAttached: true,
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-11-16'
	},
	{
		id: 'EC-2024-004',
		description: 'Conference registration fee',
		amount: 299.00,
		currency: 'USD',
		category: 'Training & Development',
		status: 'rejected',
		submittedDate: '2024-10-20',
		receiptAttached: false,
		approvedBy: 'Sarah Manager',
		approvedDate: '2024-10-22',
		rejectionReason: 'Please attach receipt and resubmit'
	}
]

// Employee's payslips
export const myPayslips: PayslipData[] = [
	{
		id: 'PS-2024-12',
		month: 'December',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-12-01',
		status: 'processed',
		downloadUrl: '/api/payslips/PS-2024-12.pdf'
	},
	{
		id: 'PS-2024-11',
		month: 'November',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-11-01',
		status: 'processed',
		downloadUrl: '/api/payslips/PS-2024-11.pdf'
	},
	{
		id: 'PS-2024-10',
		month: 'October',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-10-01',
		status: 'processed',
		downloadUrl: '/api/payslips/PS-2024-10.pdf'
	},
	{
		id: 'PS-2024-09',
		month: 'September',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-09-01',
		status: 'processed',
		downloadUrl: '/api/payslips/PS-2024-09.pdf'
	},
	{
		id: 'PS-2024-08',
		month: 'August',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-08-01',
		status: 'processed',
		downloadUrl: '/api/payslips/PS-2024-08.pdf'
	},
	{
		id: 'PS-2024-07',
		month: 'July',
		year: 2024,
		grossSalary: 8500.00,
		netSalary: 6545.50,
		currency: 'USD',
		payDate: '2024-07-01',
		status: 'pending'
	}
]

// Generate pie chart data for taken vs remaining leave
export const generateLeaveChartData = async (): Promise<LeaveTypeData[]> => {
	const leaveBalances = await combineLeaveData()
	return leaveBalances.map(leave => ({
		name: leave.leaveType.replace(' Leave', ''),
		value: leave.taken,
		color: leave.color
	}))
}

// Generate pie chart data for remaining leave
export const generateRemainingLeaveChartData = async (): Promise<LeaveTypeData[]> => {
	const leaveBalances = await combineLeaveData()
	return leaveBalances.map(leave => ({
		name: leave.leaveType.replace(' Leave', ''),
		value: leave.remaining,
		color: leave.color
	}))
}

// Calculate employee dashboard statistics
export const getEmployeeDashboardStats = async (): Promise<EmployeeDashboardStats> => {
	try {
		const leaveBalances = await combineLeaveData()
		const leaveApplicationsData = await fetchLeaveApplications()
		
		const totalLeaveTaken = leaveBalances.reduce((sum: number, leave: LeaveBalance) => {
			const taken = typeof leave.taken === 'number' ? leave.taken : 0
			return sum + taken
		}, 0)
		
		const totalLeaveRemaining = leaveBalances.reduce((sum: number, leave: LeaveBalance) => {
			const remaining = typeof leave.remaining === 'number' ? leave.remaining : 0
			return sum + remaining
		}, 0)
		
		// Use real pending count from Frappe instead of dummy data
		const myPendingLeaveApplications = typeof leaveApplicationsData.pendingCount === 'number' 
			? leaveApplicationsData.pendingCount 
			: 0
		
		// Keep dummy data for expense claims for now (until we implement expense claims API)
		const myPendingExpenseClaims = myExpenseClaims.filter(claim => claim.status === 'pending').length
		
		// Calculate recent applications from real Frappe data (last 30 days)
		const thirtyDaysAgo = new Date()
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
		const recentApplications = Array.isArray(leaveApplicationsData.applications) 
			? leaveApplicationsData.applications.filter(app => 
				app.posting_date && new Date(app.posting_date) >= thirtyDaysAgo
			).length
			: 0
		
		// Calculate approved this month from real Frappe data
		const currentMonth = new Date().getMonth()
		const currentYear = new Date().getFullYear()
		const approvedThisMonth = Array.isArray(leaveApplicationsData.applications)
			? leaveApplicationsData.applications.filter(app => 
				app.leave_status === 'Approved' && 
				app.posting_date &&
				new Date(app.posting_date).getMonth() === currentMonth &&
				new Date(app.posting_date).getFullYear() === currentYear
			).length
			: 0
		
		console.log('Dashboard Stats:', {
			myPendingLeaveApplications,
			myPendingExpenseClaims,
			totalLeaveTaken,
			totalLeaveRemaining,
			recentApplications,
			approvedThisMonth
		})
		
		// Ensure all values are numbers
		return {
			myPendingLeaveApplications: typeof myPendingLeaveApplications === 'number' ? myPendingLeaveApplications : 0,
			myPendingExpenseClaims: typeof myPendingExpenseClaims === 'number' ? myPendingExpenseClaims : 0,
			totalLeaveTaken: typeof totalLeaveTaken === 'number' ? totalLeaveTaken : 0,
			totalLeaveRemaining: typeof totalLeaveRemaining === 'number' ? totalLeaveRemaining : 0,
			recentApplications: typeof recentApplications === 'number' ? recentApplications : 0,
			approvedThisMonth: typeof approvedThisMonth === 'number' ? approvedThisMonth : 0
		}
	} catch (error) {
		console.error('Error calculating dashboard stats:', error)
		// Return safe default values
		return {
			myPendingLeaveApplications: 0,
			myPendingExpenseClaims: 0,
			totalLeaveTaken: 0,
			totalLeaveRemaining: 0,
			recentApplications: 0,
			approvedThisMonth: 0
		}
	}
}

// Function to convert Frappe leave applications to MyLeaveApplication format
const convertFrappeToMyLeaveApplications = async (): Promise<MyLeaveApplication[]> => {
	try {
		const [leaveTypes, leaveApplicationsData] = await Promise.all([
			fetchLeaveTypes(),
			fetchLeaveApplications()
		])

		// Create a map of leave type names for display
		const leaveTypeMap = new Map<string, string>()
		if (Array.isArray(leaveTypes)) {
			leaveTypes.forEach(lt => {
				// Use description if available, otherwise use leave_mapping_code, otherwise use name
				const displayName = lt.description && lt.description.trim() 
					? lt.description.trim()
					: lt.leave_mapping_code && lt.leave_mapping_code.trim()
					? lt.leave_mapping_code.trim()
					: lt.name
				leaveTypeMap.set(lt.name, displayName)
			})
		}

		// Ensure we have valid applications array
		const applications = Array.isArray(leaveApplicationsData.applications) 
			? leaveApplicationsData.applications 
			: []

		// Convert Frappe applications to MyLeaveApplication format
		const myApplications: MyLeaveApplication[] = applications.map(app => {
			// Ensure app is an object and has required properties
			if (!app || typeof app !== 'object') {
				console.error('Invalid application data:', app)
				return null
			}

			// Map workflow_state to our status format
			let status: 'pending' | 'approved' | 'rejected' = 'pending'
			if (app.leave_status === 'Approved') {
				status = 'approved'
			} else if (app.leave_status === 'Rejected') {
				status = 'rejected'
			} else if (app.leave_status === 'Pending Approval') {
				status = 'pending'
			}

			// Get display name for leave type
			const leaveTypeDisplay = leaveTypeMap.get(app.leave_type) || app.leave_type || 'Unknown Leave Type'

			// Ensure all required fields are strings/numbers
			return {
				id: typeof app.name === 'string' ? app.name : 'Unknown',
				leaveType: typeof leaveTypeDisplay === 'string' ? leaveTypeDisplay : 'Unknown Leave Type',
				fromDate: typeof app.from_date === 'string' ? app.from_date : new Date().toISOString().split('T')[0],
				toDate: typeof app.to_date === 'string' ? app.to_date : new Date().toISOString().split('T')[0],
				days: typeof app.total_leave_days === 'number' ? app.total_leave_days : 0,
				reason: app.description && typeof app.description === 'string' && app.description.trim() 
					? app.description.trim() 
					: 'Personal leave',
				status: status,
				appliedDate: typeof app.posting_date === 'string' ? app.posting_date : new Date().toISOString().split('T')[0],
				approvedBy: app.leave_approver && typeof app.leave_approver === 'string' ? app.leave_approver : undefined,
				approvedDate: status === 'approved' && typeof app.posting_date === 'string' ? app.posting_date : undefined,
				rejectionReason: status === 'rejected' ? 'Application was rejected' : undefined
			}
		}).filter(app => app !== null) as MyLeaveApplication[] // Remove any null entries

		// Sort by applied date (most recent first)
		myApplications.sort((a, b) => {
			const dateA = new Date(a.appliedDate)
			const dateB = new Date(b.appliedDate)
			return dateB.getTime() - dateA.getTime()
		})

		console.log('Converted Frappe applications to MyLeaveApplication format:', myApplications)
		return myApplications
	} catch (error) {
		console.error('Error converting Frappe leave applications:', error)
		// Return empty array instead of dummy data to prevent rendering issues
		return []
	}
}

// Service functions to simulate API calls
export const employeeDashboardService = {
	async getMyLeaveApplications(): Promise<MyLeaveApplication[]> {
		// Use real Frappe data instead of dummy data
		return await convertFrappeToMyLeaveApplications()
	},

	async getMyExpenseClaims(): Promise<MyExpenseClaim[]> {
		// Simulate API delay
		await new Promise(resolve => setTimeout(resolve, 500))
		return myExpenseClaims
	},

	async getLeaveBalances(): Promise<LeaveBalance[]> {
		// Use real Frappe data instead of dummy data
		return await combineLeaveData()
	},

	async getEmployeeDashboardStats(): Promise<EmployeeDashboardStats> {
		// Use real data for calculations
		return await getEmployeeDashboardStats()
	},

	async getMyPayslips(): Promise<PayslipData[]> {
		// Simulate API delay
		await new Promise(resolve => setTimeout(resolve, 400))
		return myPayslips
	}
} 