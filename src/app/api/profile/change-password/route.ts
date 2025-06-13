import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		const { old_password, new_password } = body

		if (!old_password || !new_password) {
			return NextResponse.json(
				{ error: 'Missing old_password or new_password' },
				{ status: 400 }
			)
		}

		const frappeUrl = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000'
		const cookieHeader = request.headers.get('cookie') || ''
		
		const response = await fetch(`${frappeUrl}/api/method/frappe.core.doctype.user.user.update_password`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookieHeader,
			},
			body: JSON.stringify({ old_password, new_password }),
		})

		const responseText = await response.text()
		console.log('Frappe password change response status:', response.status)
		console.log('Frappe password change response:', responseText)

		if (!response.ok) {
			throw new Error(`Frappe API error: ${response.status} - ${responseText}`)
		}

		// Parse JSON response
		let data
		try {
			data = JSON.parse(responseText)
		} catch (e) {
			throw new Error('Invalid JSON response from Frappe')
		}

		return NextResponse.json(data)
	} catch (error) {
		console.error('Password change error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to change password', details: errorMessage },
			{ status: 500 }
		)
	}
} 