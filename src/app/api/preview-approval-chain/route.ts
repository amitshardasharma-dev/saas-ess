import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const employee = searchParams.get('employee')
		const leaveType = searchParams.get('leave_type')
		const totalDays = searchParams.get('total_days')
		const fromDate = searchParams.get('from_date')
		const tillDate = searchParams.get('till_date')

		if (!employee || !leaveType || !totalDays || !fromDate || !tillDate) {
			return NextResponse.json(
				{ error: 'Missing required parameters' },
				{ status: 400 }
			)
		}

		console.log('Previewing Approval Chain from Frappe...')
		console.log('Cookie header present:', request.headers.get('cookie') ? 'Yes' : 'No')

		// Forward the request to Frappe with cookies
		const frappeUrl = `http://hr.portal:8000/api/method/hr_portal.hr.doctype.leave_application.leave_application.preview_approval_chain?employee=${employee}&leave_type=${leaveType}&total_leave_days=${totalDays}&from_date=${fromDate}&till_date=${tillDate}`
		
		console.log('Making request to Frappe URL:', frappeUrl)

		const frappeResponse = await fetch(frappeUrl, {
			method: 'GET',
			headers: {
				'Cookie': request.headers.get('cookie') || '',
				'Content-Type': 'application/json'
			}
		})

		console.log('Frappe response status:', frappeResponse.status)
		console.log('Frappe response ok:', frappeResponse.ok)

		if (!frappeResponse.ok) {
			const errorText = await frappeResponse.text()
			console.error('Frappe error response:', errorText)
			return NextResponse.json(
				{ error: 'Failed to preview approval chain from Frappe' },
				{ status: frappeResponse.status }
			)
		}

		const data = await frappeResponse.json()
		console.log('Raw approval chain data from Frappe:', JSON.stringify(data, null, 2))

		return NextResponse.json(data.message || data)
	} catch (error) {
		console.error('Error previewing approval chain:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 