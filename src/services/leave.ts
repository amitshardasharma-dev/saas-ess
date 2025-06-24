// All API calls now use relative paths to Next.js API routes

export interface LeaveType {
	name: string
	leave_type_name: string | null
	leave_mapping_code: string
	bc_leave_code: string
	eligible_days: number
	description: string | null
	without_pay: number
	leave_applicable_to_gender: string
}

export interface Employee {
	name: string
	employee_name: string // This will contain full_name or employee_name from the API
	user_id: string
	employee_id?: string // Employee ID field
	full_name?: string // Full name field
	bc_employee_id?: string // BC Employee ID field
	company: string
	department: string
	leave_approval_enabled?: number // 1 = enabled, 0 = disabled
	expense_approval_enabled?: number // 1 = enabled, 0 = disabled
}

export interface LeaveApplicationData {
	leave_type: string
	from_date: string
	till_date: string
	leave_reason: string
	total_leave_days: number
	link_lmbb?: string
}

export interface ApprovalChainLevel {
	level_no: number
	approver: string
	approver_name: string
	status: 'Pending' | 'Approved' | 'Rejected'
	sla_deadline: string
	action_time?: string
	remarks?: string
}

export interface ApprovalChain {
	leave_id?: string
	workflow_state?: string
	approval_chain?: ApprovalChainLevel[]
	// Error response fields
	error?: string
	default_approver?: string
}

export interface PendingApproval {
	name: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	till_date: string
	total_days: number
	reason: string
	level_no: number
	workflow_state: string
	// Additional fields for approval history
	action_status?: string
	action_time?: string
	remarks?: string
	creation?: string
}

export interface ApprovalHistoryItem {
	leave_id: string
	employee: string
	employee_name: string
	leave_type: string
	from_date: string
	till_date: string
	total_days: number
	reason: string
	my_action: string
	action_date: string
	remarks?: string
	final_status: string
	creation: string
	approved_level?: number
}

export class LeaveService {
	private static instance: LeaveService

	private constructor() {
		// Constructor intentionally empty - using relative API paths
	}

	static getInstance(): LeaveService {
		if (!LeaveService.instance) {
			LeaveService.instance = new LeaveService()
		}
		return LeaveService.instance
	}

	/**
	 * Get current user's employee record
	 */
	async getCurrentEmployee(): Promise<Employee | null> {
		try {
			console.log('Getting current employee via API route...')
			const response = await fetch('/api/employee', {
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error(`Failed to fetch employee: ${response.status} ${response.statusText}`)
			}

			const data = await response.json()
			console.log('Employee data from API:', data)
			
			if (data.employee) {
				return data.employee
			}

			console.warn('No employee record found')
			return null
		} catch (error) {
			console.error('Error getting current employee:', error)
			throw error
		}
	}

	/**
	 * Get all leave types
	 */
	async getLeaveTypes(): Promise<LeaveType[]> {
		try {
			console.log('Fetching leave types via API route...')
			const response = await fetch('/api/leave-types', {
				credentials: 'include'
			})

			if (!response.ok) {
				console.log(`Leave types API error: ${response.status} ${response.statusText}`)
				if (response.status === 401) {
					console.log('Authentication required for leave types')
					return []
				}
				if (response.status === 403) {
					console.log('Access denied to leave types')
					return []
				}
				throw new Error(`Failed to fetch leave types: ${response.status} ${response.statusText}`)
			}

			const data = await response.json()
			console.log('Leave types data from API:', data)
			console.log('Leave types array:', data.leave_types)
			
			const leaveTypes = data.leave_types || []
			console.log('Returning leave types count:', leaveTypes.length)
			return leaveTypes
		} catch (error) {
			console.error('Error fetching leave types:', error)
			// Return empty array instead of throwing error to match dashboard behavior
			return []
		}
	}

	/**
	 * Preview approval chain before submitting leave application
	 */
	async previewApprovalChain(
		employee: string,
		leaveType: string,
		totalDays: number,
		fromDate: string,
		tillDate: string
	): Promise<ApprovalChain> {
		try {
			const response = await fetch(`/api/preview-approval-chain?employee=${employee}&leave_type=${leaveType}&total_days=${totalDays}&from_date=${fromDate}&till_date=${tillDate}`, {
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error('Failed to preview approval chain')
			}

			const data = await response.json()
			return data
		} catch (error) {
			console.error('Error previewing approval chain:', error)
			throw error
		}
	}

	/**
	 * Calculate working days between two dates
	 */
	calculateWorkingDays(fromDate: string, tillDate: string): number {
		const start = new Date(fromDate)
		const end = new Date(tillDate)
		
		// If same date, it's 1 day
		if (start.getTime() === end.getTime()) {
			return 1
		}
		
		let workingDays = 0
		const current = new Date(start)
		
		while (current <= end) {
			// Count all days (including weekends for now, as business rules may vary)
			workingDays++
			current.setDate(current.getDate() + 1)
		}
		
		return workingDays
	}

	/**
	 * Create new leave application
	 */
	async createLeaveApplication(leaveData: LeaveApplicationData): Promise<{ name: string; message: string }> {
		try {
			// Create and submit the leave application in one step (docstatus: 1 submits it)
			const response = await fetch('/api/leave-applications', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include',
				body: JSON.stringify({
					...leaveData,
					docstatus: 1 // Submit the application immediately
				})
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || errorData.message || 'Failed to create leave application')
			}

			const data = await response.json()
			const leaveId = data.name || data.data?.name

			return {
				name: leaveId,
				message: 'Leave application created and submitted successfully'
			}
		} catch (error) {
			console.error('Error creating leave application:', error)
			throw error
		}
	}

	/**
	 * Get approval chain for a leave application
	 */
	async getApprovalChain(leaveId: string): Promise<ApprovalChain> {
		try {
			const response = await fetch(`/api/approval-chain/${leaveId}`, {
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error('Failed to get approval chain')
			}

			const data = await response.json()
			return data
		} catch (error) {
			console.error('Error getting approval chain:', error)
			throw error
		}
	}

	/**
	 * Get approval history for current user
	 */
	async getApprovalHistory(): Promise<ApprovalHistoryItem[]> {
		try {
			const response = await fetch('/api/approval-history', {
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error('Failed to get approval history')
			}

			const data = await response.json()
			// The API now returns an array directly
			return data || []
		} catch (error) {
			console.error('Error getting approval history:', error)
			throw error
		}
	}

	/**
	 * Get pending approvals for current user
	 */
	async getPendingApprovals(): Promise<PendingApproval[]> {
		try {
			const response = await fetch('/api/pending-approvals', {
				credentials: 'include'
			})

			if (!response.ok) {
				throw new Error('Failed to get pending approvals')
			}

			const data = await response.json()
			return data || []
		} catch (error) {
			console.error('Error getting pending approvals:', error)
			throw error
		}
	}

	/**
	 * Approve or reject a leave application
	 */
	async processLeaveApproval(
		leaveId: string, 
		action: 'approve' | 'reject', 
		remarks: string
	): Promise<{ message: string; workflow_state: string }> {
		try {
			const response = await fetch('/api/process-approval', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include',
				body: JSON.stringify({
					leave_id: leaveId,
					action: action,
					remarks: remarks
				})
			})

			if (!response.ok) {
				const errorData = await response.json()
				throw new Error(errorData.error || errorData.message || 'Failed to process leave approval')
			}

			const data = await response.json()
			return data
		} catch (error) {
			console.error('Error processing leave approval:', error)
			throw error
		}
	}

	/**
	 * Validate leave application data
	 */
	validateLeaveApplication(formData: Omit<LeaveApplicationData, 'link_lmbb'>): { isValid: boolean; errors: { [key: string]: string } } {
		const errors: { [key: string]: string } = {}

		if (!formData.leave_type) {
			errors.leave_type = 'Leave type is required'
		}

		if (!formData.from_date) {
			errors.from_date = 'From date is required'
		}

		if (!formData.till_date) {
			errors.till_date = 'Till date is required'
		}

		if (formData.from_date && formData.till_date) {
			const fromDate = new Date(formData.from_date)
			const tillDate = new Date(formData.till_date)
			
			if (fromDate > tillDate) {
				errors.till_date = 'Till date must be after or equal to from date'
			}

			// Check if from date is in the past (allow today)
			const today = new Date()
			today.setHours(0, 0, 0, 0)
			fromDate.setHours(0, 0, 0, 0)
			
			if (fromDate < today) {
				errors.from_date = 'From date cannot be in the past'
			}
		}

		if (!formData.leave_reason || formData.leave_reason.trim().length < 10) {
			errors.leave_reason = 'Reason must be at least 10 characters'
		}

		if (formData.total_leave_days <= 0) {
			errors.total_leave_days = 'Total leave days must be greater than 0'
		}

		return {
			isValid: Object.keys(errors).length === 0,
			errors
		}
	}
}

export const leaveService = LeaveService.getInstance() 