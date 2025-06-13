import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

export async function GET(
	request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params
		console.log(`Fetching Approval Chain for Leave Application ${id}...`)
		
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

		// Get approval chain for the leave application
		const approvalChainUrl = `${config.frappe.url.replace(/\/$/, '')}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_leave_approval_chain?leave_id=${id}`
		console.log('Making request to get approval chain:', approvalChainUrl)
		
		const chainResponse = await fetch(approvalChainUrl, {
			method: 'GET',
			headers: {
				Cookie: cookieHeader,
			},
		})

		console.log('Approval chain response status:', chainResponse.status)

		if (!chainResponse.ok) {
			if (chainResponse.status === 404) {
				return NextResponse.json(
					{ error: 'Leave application not found' },
					{ status: 404 }
				)
			}
			const errorText = await chainResponse.text()
			console.error('Failed to fetch approval chain:', errorText)
			return NextResponse.json(
				{ error: 'Failed to fetch approval chain' },
				{ status: chainResponse.status }
			)
		}

		const chainData = await chainResponse.json()
		console.log('Approval chain data:', JSON.stringify(chainData, null, 2))

		return NextResponse.json({
			approval_chain: chainData.message || null
		})
	} catch (error) {
		console.error('Approval Chain fetch error:', error)
		
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 