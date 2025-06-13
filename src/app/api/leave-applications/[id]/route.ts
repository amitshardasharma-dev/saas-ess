import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeLeaveApplication {
	name: string
	owner?: string
	creation?: string
	modified?: string
	modified_by?: string
	docstatus?: number
	idx?: number
	workflow_state: string
	leave_type: string
	from_date: string
	till_date: string
	leave_reason?: string
	half_day?: number
	total_leave_days: number
	link_lmbb?: string
	leave_approver?: string
	doctype: string
}

interface FrappeEmployee {
	name: string
	bc_employee_id?: string
	full_name?: string
}

interface FrappeLeaveApplicationResponse {
	data: FrappeLeaveApplication
}

interface FrappeEmployeeResponse {
	data: FrappeEmployee
}

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	const { id } = await params
	try {
		
		// Forward cookies from the request for authentication
		const cookieHeader = request.headers.get('Cookie')
		
		console.log(`Fetching Leave Application ${id} from Frappe...`)
		console.log('Cookie header present:', cookieHeader ? 'Yes' : 'No')
		
		// First check if user is authenticated
		const authResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!authResponse.ok) {
			console.log('Authentication check failed:', authResponse.status)
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		const authData = await authResponse.json()
		if (!authData.message || authData.message === 'Guest') {
			console.log('User not authenticated, message:', authData.message)
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		console.log('User authenticated:', authData.message)
		
		// Fetch the specific leave application
		const detailUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application/${id}`
		console.log(`Making request to: ${detailUrl}`)
		
		const detailResponse = await fetch(detailUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Leave application detail response status:', detailResponse.status)

		if (!detailResponse.ok) {
			if (detailResponse.status === 404) {
				return NextResponse.json(
					{ error: 'Leave application not found' },
					{ status: 404 }
				)
			}
			console.log('Failed to fetch leave application details')
			return NextResponse.json(
				{ error: 'Failed to fetch leave application details' },
				{ status: detailResponse.status }
			)
		}

		const detailData: FrappeLeaveApplicationResponse = await detailResponse.json()
		const application = detailData.data
		
		console.log(`Leave application ${id} details:`, JSON.stringify(application, null, 2))
		
		// Fetch employee details if employee ID is available
		let employeeDetails: FrappeEmployee | null = null
		if (application.link_lmbb) {
			try {
				const employeeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee/${application.link_lmbb}?fields=["name","bc_employee_id","full_name"]`
				console.log(`Fetching employee details from: ${employeeUrl}`)
				
				const employeeResponse = await fetch(employeeUrl, {
					method: 'GET',
					headers: {
						...(cookieHeader && { Cookie: cookieHeader }),
					},
				})

				if (employeeResponse.ok) {
					const employeeData: FrappeEmployeeResponse = await employeeResponse.json()
					employeeDetails = employeeData.data
					console.log(`Employee details for ${application.link_lmbb}:`, JSON.stringify(employeeDetails, null, 2))
				} else {
					console.log(`Failed to fetch employee details: ${employeeResponse.status}`)
				}
			} catch (error) {
				console.error('Error fetching employee details:', error)
			}
		}

		// Fetch approver/rejector employee details if leave_approver is available
		let approverDetails: FrappeEmployee | null = null
		if (application.leave_approver) {
			try {
				const approverUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee/${application.leave_approver}?fields=["name","bc_employee_id","full_name"]`
				console.log(`Fetching approver details from: ${approverUrl}`)
				
				const approverResponse = await fetch(approverUrl, {
					method: 'GET',
					headers: {
						...(cookieHeader && { Cookie: cookieHeader }),
					},
				})

				if (approverResponse.ok) {
					const approverData: FrappeEmployeeResponse = await approverResponse.json()
					approverDetails = approverData.data
					console.log(`Approver details for ${application.leave_approver}:`, JSON.stringify(approverDetails, null, 2))
				} else {
					console.log(`Failed to fetch approver details: ${approverResponse.status}`)
				}
			} catch (error) {
				console.error('Error fetching approver details:', error)
			}
		}
		
		// Calculate actual leave days if total_leave_days is 0 or not reliable
		let actualLeaveDays = application.total_leave_days
		if (actualLeaveDays === 0 || actualLeaveDays === null || actualLeaveDays === undefined) {
			// Simple calculation - count days between from_date and till_date
			const fromDate = new Date(application.from_date)
			const tillDate = new Date(application.till_date)
			
			if (fromDate.getTime() === tillDate.getTime()) {
				actualLeaveDays = 1
			} else {
				let workingDays = 0
				const current = new Date(fromDate)
				
				while (current <= tillDate) {
					workingDays++
					current.setDate(current.getDate() + 1)
				}
				
				actualLeaveDays = workingDays
			}
			console.log(`Calculated ${actualLeaveDays} working days for ${id}`)
		}
		
		// Process the application for our API response
		const processedApplication = {
			name: application.name,
			employee: application.link_lmbb || '',
			employee_name: employeeDetails?.full_name || '',
			bc_employee_id: employeeDetails?.bc_employee_id || '',
			leave_type: application.leave_type,
			from_date: application.from_date,
			to_date: application.till_date, // Map till_date to to_date for consistency
			total_leave_days: actualLeaveDays,
			leave_status: application.workflow_state, // Map workflow_state to leave_status for consistency
			posting_date: application.from_date, // Use from_date as posting_date
			description: application.leave_reason || '',
			leave_approver: application.leave_approver || '',
			leave_approver_name: approverDetails?.full_name || '',
			leave_approver_bc_id: approverDetails?.bc_employee_id || '',
			// Additional fields for detailed view
			creation: application.creation,
			modified: application.modified,
			owner: application.owner,
			half_day: application.half_day || 0
		}

		console.log(`Processed leave application ${id}:`, JSON.stringify(processedApplication, null, 2))
		
		return NextResponse.json({
			leave_application: processedApplication
		})
	} catch (error) {
		console.error(`Leave Application ${id} fetch error:`, error)
		
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 