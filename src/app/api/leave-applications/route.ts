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

interface FrappeLeaveApplicationsResponse {
	data: FrappeLeaveApplication[]
}

interface FrappeLeaveApplicationResponse {
	data: FrappeLeaveApplication
}

// Helper function to calculate working days between two dates
function calculateWorkingDays(fromDate: string, tillDate: string): number {
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

export async function GET(request: NextRequest) {
	try {
		// Forward cookies from the request for authentication
		const cookieHeader = request.headers.get('Cookie')
		
		console.log('Fetching Leave Applications from Frappe...')
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
			return NextResponse.json({
				leave_applications: [],
				leave_summary: {},
				pending_count: 0
			})
		}

		const authData = await authResponse.json()
		if (!authData.message || authData.message === 'Guest') {
			console.log('User not authenticated, message:', authData.message)
			return NextResponse.json({
				leave_applications: [],
				leave_summary: {},
				pending_count: 0
			})
		}

		console.log('User authenticated:', authData.message)
		
		// Get current user's employee ID
		const userResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/User/${authData.message}`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!userResponse.ok) {
			console.log('Failed to fetch user data:', userResponse.status)
			return NextResponse.json({
				leave_applications: [],
				leave_summary: {},
				pending_count: 0
			})
		}

		const userData = await userResponse.json()
		const currentUserEmployeeId = userData.data.employee_id || userData.data.employee
		
		if (!currentUserEmployeeId) {
			console.log('No employee ID found for user:', authData.message)
			return NextResponse.json({
				leave_applications: [],
				leave_summary: {},
				pending_count: 0
			})
		}

		console.log('Current user employee ID:', currentUserEmployeeId)
		
		// Step 1: Get list of leave applications filtered by current user's employee ID, sorted by modified date (most recent first)
		let listUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application?filters=[["link_lmbb","=","${currentUserEmployeeId}"]]&order_by=modified desc`
		console.log('Making request to get leave application list:', listUrl)
		
		let listResponse = await fetch(listUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Leave applications list response status:', listResponse.status)

		if (!listResponse.ok) {
			console.log('Failed to fetch leave applications list, returning empty array')
			return NextResponse.json({
				leave_applications: [],
				leave_summary: {},
				pending_count: 0
			})
		}

		const listData: FrappeLeaveApplicationsResponse = await listResponse.json()
		console.log('Leave applications list:', JSON.stringify(listData, null, 2))
		
		// Step 2: Fetch detailed data for each leave application
		const detailedApplications: FrappeLeaveApplication[] = []
		const currentYear = new Date().getFullYear()
		const leaveSummary: { [leaveType: string]: number } = {}
		let pendingApplicationsCount = 0
		
		console.log(`Processing ${listData.data.length} leave applications for user ${currentUserEmployeeId}...`)
		
		for (const app of listData.data) {
			try {
				const detailUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application/${app.name}`
				console.log(`Fetching details for ${app.name}`)
				
				const detailResponse = await fetch(detailUrl, {
					method: 'GET',
					headers: {
						...(cookieHeader && { Cookie: cookieHeader }),
					},
				})

				if (detailResponse.ok) {
					const detailData: FrappeLeaveApplicationResponse = await detailResponse.json()
					const application = detailData.data
					
					// Double-check that this application belongs to the current user
					if (application.link_lmbb !== currentUserEmployeeId) {
						console.log(`Skipping ${app.name} - belongs to different employee: ${application.link_lmbb}`)
						continue
					}
					
					// Filter for current year
					const fromDate = new Date(application.from_date)
					const tillDate = new Date(application.till_date)
					const isCurrentYear = fromDate.getFullYear() === currentYear || tillDate.getFullYear() === currentYear
					
					console.log(`${app.name}: leave_type=${application.leave_type}, workflow_state=${application.workflow_state}, from=${application.from_date}, till=${application.till_date}`)
					
					if (isCurrentYear) {
						// Calculate actual leave days if total_leave_days is 0 or not reliable
						let actualLeaveDays = application.total_leave_days
						if (actualLeaveDays === 0 || actualLeaveDays === null || actualLeaveDays === undefined) {
							actualLeaveDays = calculateWorkingDays(application.from_date, application.till_date)
							console.log(`Calculated ${actualLeaveDays} working days for ${app.name}`)
						}
						
						// Count pending applications
						if (application.workflow_state === 'Pending Approval') {
							pendingApplicationsCount++
							console.log(`Found pending application: ${app.name}`)
						}
						
						// Only count approved leaves for the summary
						if (application.workflow_state === 'Approved') {
							if (!leaveSummary[application.leave_type]) {
								leaveSummary[application.leave_type] = 0
							}
							leaveSummary[application.leave_type] += actualLeaveDays
							console.log(`Added ${actualLeaveDays} days to ${application.leave_type}, total now: ${leaveSummary[application.leave_type]}`)
						}
						
						// Add to detailed applications (all current year applications, not just approved)
						detailedApplications.push({
							...application,
							total_leave_days: actualLeaveDays // Use calculated days
						})
					}
				} else {
					console.log(`Failed to fetch details for ${app.name}:`, detailResponse.status)
				}
			} catch (error) {
				console.log(`Error fetching details for ${app.name}:`, error)
			}
		}
		
		console.log('Leave Summary by Type:', leaveSummary)
		console.log('Pending Applications Count:', pendingApplicationsCount)
		
		// Process the applications for our API response
		const processedLeaveApplications = detailedApplications.map(application => ({
			name: application.name,
			employee: application.link_lmbb || '',
			employee_name: '', // Not available in your structure
			leave_type: application.leave_type,
			from_date: application.from_date,
			to_date: application.till_date, // Map till_date to to_date for consistency
			total_leave_days: application.total_leave_days,
			leave_status: application.workflow_state, // Map workflow_state to leave_status for consistency
			posting_date: application.from_date, // Use from_date as posting_date
			description: application.leave_reason || '',
			leave_approver: application.leave_approver || '',
			modified: application.modified || application.creation || application.from_date // Include modified date
		}))
		
		// Sort by modified date (most recent first) to ensure proper ordering
		processedLeaveApplications.sort((a, b) => {
			const dateA = new Date(a.modified)
			const dateB = new Date(b.modified)
			return dateB.getTime() - dateA.getTime()
		})

		console.log(`Processed ${processedLeaveApplications.length} leave applications for user ${currentUserEmployeeId}`)
		console.log('Final leave summary:', leaveSummary)
		
		return NextResponse.json({
			leave_applications: processedLeaveApplications,
			leave_summary: leaveSummary, // Add summary for easy consumption by dashboard
			pending_count: pendingApplicationsCount, // Add pending count for dashboard stats
			user_context: currentUserEmployeeId // Add user context for verification
		})
	} catch (error) {
		console.error('Leave Applications fetch error:', error)
		
		// Return empty array instead of error to prevent dashboard from breaking
		console.log('Returning empty leave applications due to error')
		return NextResponse.json({
			leave_applications: [],
			leave_summary: {},
			pending_count: 0
		})
	}
}

export async function POST(request: NextRequest) {
	try {
		const cookieHeader = request.headers.get('Cookie')
		
		console.log('Creating Leave Application in Frappe...')
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
		
		// Get the request body
		const leaveData = await request.json()
		console.log('Leave application data:', JSON.stringify(leaveData, null, 2))
		
		// Create the leave application in Frappe
		const createUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application`
		console.log('Making request to create leave application:', createUrl)
		
		const createResponse = await fetch(createUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(cookieHeader && { Cookie: cookieHeader }),
			},
			body: JSON.stringify(leaveData)
		})

		console.log('Create leave application response status:', createResponse.status)

		if (!createResponse.ok) {
			const errorText = await createResponse.text()
			console.error('Frappe error response:', errorText)
			
			let errorMessage = 'Failed to create leave application'
			try {
				const errorData = JSON.parse(errorText)
				errorMessage = errorData.exception || errorData.message || errorMessage
			} catch (e) {
				// If we can't parse the error, use the raw text
				errorMessage = errorText || errorMessage
			}
			
			return NextResponse.json(
				{ error: errorMessage },
				{ status: createResponse.status }
			)
		}

		const responseData = await createResponse.json()
		console.log('Leave application created successfully:', JSON.stringify(responseData, null, 2))
		
		return NextResponse.json({
			name: responseData.data.name,
			message: 'Leave application created successfully',
			data: responseData.data
		})
	} catch (error) {
		console.error('Error creating leave application:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 