import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

export async function POST(request: NextRequest) {
	try {
		console.log('Processing Leave Approval...')
		
		// Get cookies from the request
		const cookieHeader = request.headers.get('cookie')
		console.log('Cookie header present:', cookieHeader ? 'Yes' : 'No')
		
		if (!cookieHeader) {
			console.log('No cookie header found')
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		// Parse request body
		const body = await request.json()
		const { leave_id, action, remarks } = body

		if (!leave_id || !action) {
			return NextResponse.json(
				{ error: 'Leave ID and action are required' },
				{ status: 400 }
			)
		}

		if (!['approve', 'reject'].includes(action)) {
			return NextResponse.json(
				{ error: 'Action must be either "approve" or "reject"' },
				{ status: 400 }
			)
		}

		// Check authentication first
		const authResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				Cookie: cookieHeader,
			},
		})

		if (!authResponse.ok) {
			console.log('Authentication check failed:', authResponse.status)
			return NextResponse.json(
				{ error: 'Authentication failed' },
				{ status: 403 }
			)
		}

		const authData = await authResponse.json()
		console.log('User authenticated:', authData.message)

		// Process the approval
		const approvalUrl = `${config.frappe.url.replace(/\/$/, '')}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.approve_leave`
		console.log('Making request to process approval:', approvalUrl)
		
		const approvalResponse = await fetch(approvalUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: cookieHeader,
			},
			body: JSON.stringify({
				leave_id: leave_id,
				action: action,
				remarks: remarks || ''
			})
		})

		console.log('Approval response status:', approvalResponse.status)

		if (!approvalResponse.ok) {
			const errorText = await approvalResponse.text()
			console.error('Failed to process approval:', errorText)
			
			// Try to parse error message
			try {
				const errorData = JSON.parse(errorText)
				return NextResponse.json(
					{ error: errorData.exception || errorData.message || 'Failed to process approval' },
					{ status: approvalResponse.status }
				)
			} catch {
				return NextResponse.json(
					{ error: 'Failed to process approval' },
					{ status: approvalResponse.status }
				)
			}
		}

		const approvalData = await approvalResponse.json()
		console.log('Approval processed successfully:', JSON.stringify(approvalData, null, 2))

		return NextResponse.json({
			message: approvalData.message || `Leave application ${action}d successfully`,
			workflow_state: approvalData.workflow_state
		})
	} catch (error) {
		console.error('Process Approval error:', error)
		
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 