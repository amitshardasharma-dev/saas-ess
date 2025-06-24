import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface ApprovalHistoryItem {
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

export async function GET(request: NextRequest) {
	try {
		const cookieHeader = request.headers.get('cookie')
		
		if (!cookieHeader) {
			return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
		}

		console.log('Fetching Approval History from Frappe...')
		console.log('Cookie header present:', !!cookieHeader)

		// Extract user info from cookies to get current user's employee ID
		const userResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!userResponse.ok) {
			console.log('Failed to get current user:', userResponse.status)
			return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
		}

		const userData = await userResponse.json()
		const currentUser = userData.message
		console.log('Current user authenticated:', currentUser)

		// Get current user's employee ID
		const employeeResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/User/${currentUser}?fields=["employee_id"]`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!employeeResponse.ok) {
			console.log('Failed to get employee ID:', employeeResponse.status)
			return NextResponse.json({ error: 'Failed to get employee information' }, { status: 500 })
		}

		const employeeData = await employeeResponse.json()
		const currentEmployeeId = employeeData.data?.employee_id
		console.log('Current user employee ID:', currentEmployeeId)

		if (!currentEmployeeId) {
			console.log('No employee ID found for user')
			return NextResponse.json({ error: 'Employee ID not found' }, { status: 404 })
		}

		// Try the updated API endpoint that supports both approved and rejected applications
		let approvalHistoryResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Approval history response status:', approvalHistoryResponse.status)

		// If the API returns 417, it might be because the endpoint doesn't exist or has issues
		// Let's try to fetch leave approval entries directly
		if (!approvalHistoryResponse.ok) {
			console.log('Primary API failed, trying direct approach...')
			
			// Fetch all leave approval entries where current user is the approver and status is not Pending
			const directResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Approval Entry?filters=[["approver","=","${currentUser}"],["status","in",["Approved","Rejected"]]]&fields=["name","parent","level_no","approver","status","action_time","remarks","sla_deadline"]&limit_page_length=1000`, {
				method: 'GET',
				headers: {
					...(cookieHeader && { Cookie: cookieHeader }),
				},
			})

			if (!directResponse.ok) {
				console.log('Direct API also failed:', directResponse.status)
				return NextResponse.json({ error: 'Failed to fetch approval history' }, { status: directResponse.status })
			}

			const directData = await directResponse.json()
			console.log('Direct approval entries:', JSON.stringify(directData, null, 2))

			// Now fetch details for each leave application
			const approvalHistory: ApprovalHistoryItem[] = []
			
			for (const entry of directData.data || []) {
				try {
					// Fetch leave application details
					const leaveResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application/${entry.parent}?fields=["name","employee","leave_type","from_date","till_date","total_leave_days","leave_reason","workflow_state","creation","link_lmbb"]`, {
						method: 'GET',
						headers: {
							...(cookieHeader && { Cookie: cookieHeader }),
						},
					})

					if (leaveResponse.ok) {
						const leaveData = await leaveResponse.json()
						const leave = leaveData.data

						// Fetch employee details
						const empResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee/${leave.link_lmbb}?fields=["name","full_name"]`, {
							method: 'GET',
							headers: {
								...(cookieHeader && { Cookie: cookieHeader }),
							},
						})

						let employeeName = leave.employee || 'Unknown Employee'
						if (empResponse.ok) {
							const empData = await empResponse.json()
							employeeName = empData.data?.full_name || employeeName
						}

						approvalHistory.push({
							leave_id: leave.name,
							employee: leave.link_lmbb || leave.employee,
							employee_name: employeeName,
							leave_type: leave.leave_type,
							from_date: leave.from_date,
							till_date: leave.till_date,
							total_days: leave.total_leave_days || 0,
							reason: leave.leave_reason || '',
							my_action: entry.status, // 'Approved' or 'Rejected'
							action_date: entry.action_time || entry.sla_deadline,
							remarks: entry.remarks || '',
							final_status: leave.workflow_state || 'Unknown',
							creation: leave.creation,
							approved_level: entry.level_no
						})
					}
				} catch (error) {
					console.error(`Error processing leave application ${entry.parent}:`, error)
					// Continue with other entries
				}
			}

			// Sort by action date (most recent first)
			approvalHistory.sort((a, b) => new Date(b.action_date).getTime() - new Date(a.action_date).getTime())

			console.log(`Returning ${approvalHistory.length} approval history items from direct approach`)
			return NextResponse.json(approvalHistory)
		}

		// If the primary API worked, process its response
		const approvalHistoryData = await approvalHistoryResponse.json()
		console.log('Approval history data:', JSON.stringify(approvalHistoryData, null, 2))

		// Transform the API response to match our interface
		const approvalHistory: ApprovalHistoryItem[] = (approvalHistoryData.message || []).map((item: any) => ({
			leave_id: item.name || item.leave_id,
			employee: item.employee,
			employee_name: item.employee_name,
			leave_type: item.leave_type,
			from_date: item.from_date,
			till_date: item.till_date,
			total_days: item.total_days,
			reason: item.reason || '',
			my_action: item.my_action || item.action_status || 'Approved', // Handle different field names
			action_date: item.approval_time || item.action_time || item.modified || item.creation,
			remarks: item.approval_remarks || item.remarks || '',
			final_status: item.workflow_state || item.leave_status || item.final_status,
			creation: item.creation,
			approved_level: item.approved_level || item.level_no
		}))

		console.log(`Returning ${approvalHistory.length} approval history items`)

		return NextResponse.json(approvalHistory)

	} catch (error) {
		console.error('Error in approval history API:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
} 