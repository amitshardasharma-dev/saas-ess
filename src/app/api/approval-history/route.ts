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

		// Use the new API endpoint for getting approved applications by user
		const approvalHistoryResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_approved_by_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Approval history response status:', approvalHistoryResponse.status)

		if (!approvalHistoryResponse.ok) {
			console.log('Failed to fetch approval history:', approvalHistoryResponse.status)
			return NextResponse.json({ error: 'Failed to fetch approval history' }, { status: approvalHistoryResponse.status })
		}

		const approvalHistoryData = await approvalHistoryResponse.json()
		console.log('Approval history data:', JSON.stringify(approvalHistoryData, null, 2))

		// Transform the API response to match our interface
		const approvalHistory: ApprovalHistoryItem[] = (approvalHistoryData.message || []).map((item: any) => ({
			leave_id: item.name,
			employee: item.employee,
			employee_name: item.employee_name,
			leave_type: item.leave_type,
			from_date: item.from_date,
			till_date: item.till_date,
			total_days: item.total_days,
			reason: item.reason || '',
			my_action: 'Approved', // Since this API returns approved applications
			action_date: item.approval_time || item.modified || item.creation,
			remarks: item.approval_remarks || '',
			final_status: item.workflow_state || item.leave_status,
			creation: item.creation,
			approved_level: item.approved_level
		}))

		console.log(`Returning ${approvalHistory.length} approval history items`)

		return NextResponse.json(approvalHistory)

	} catch (error) {
		console.error('Error in approval history API:', error)
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
	}
} 