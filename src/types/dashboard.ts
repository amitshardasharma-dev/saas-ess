export interface MyLeaveApplication {
	id: string
	leaveType: string
	fromDate: string
	toDate: string
	days: number
	reason: string
	status: 'pending' | 'approved' | 'rejected'
	appliedDate: string
	approvedBy?: string
	approvedDate?: string
	rejectionReason?: string
	// Additional optional fields for detailed view
	createdDate?: string
	modifiedDate?: string
	owner?: string
	halfDay?: boolean
	employeeId?: string
	bcEmployeeId?: string
	employeeName?: string
	approverBcEmployeeId?: string
	approverName?: string
}

export interface MyExpenseClaim {
	id: string
	description: string
	amount: number
	currency: string
	category: string
	status: 'pending' | 'approved' | 'rejected'
	submittedDate: string
	receiptAttached: boolean
	approvedBy?: string
	approvedDate?: string
	rejectionReason?: string
}

export interface LeaveBalance {
	id: string
	leaveType: string
	totalAllowed: number
	taken: number
	remaining: number
	color: string
}

// Frappe Leave Type structure
export interface FrappeLeaveTypeData {
	name: string
	leave_type_name: string
	leave_mapping_code: string
	eligible_days: number
	description: string
	without_pay: number
	leave_applicable_to_gender: string
}

// Frappe Leave Allocation structure
export interface FrappeLeaveAllocationData {
	name: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	to_date: string
	new_leaves_allocated: number
	leaves_taken: number
	total_leaves_allocated: number
	unused_leaves: number
	expired_leaves: number
	carry_forwarded_leaves: number
	remaining_leaves: number
}

// Frappe Leave Application structure
export interface FrappeLeaveApplicationData {
	name: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	to_date: string
	total_leave_days: number
	leave_status: string
	posting_date: string
	description: string
	leave_approver: string
}

export interface LeaveTypeData {
	name: string
	value: number
	color: string
}

export interface EmployeeDashboardStats {
	myPendingLeaveApplications: number
	myPendingExpenseClaims: number
	totalLeaveTaken: number
	totalLeaveRemaining: number
	recentApplications: number
	approvedThisMonth: number
}

export interface PayslipData {
	id: string
	month: string
	year: number
	grossSalary: number
	netSalary: number
	currency: string
	payDate: string
	status: 'processed' | 'pending' | 'draft'
	downloadUrl?: string
} 