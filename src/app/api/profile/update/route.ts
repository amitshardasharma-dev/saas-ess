import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
	try {
		const body = await request.json()
		const { userId, updates } = body

		if (!userId || !updates) {
			return NextResponse.json(
				{ error: 'Missing userId or updates' },
				{ status: 400 }
			)
		}

		const frappeUrl = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000'
		const cookieHeader = request.headers.get('cookie') || ''
		
		const response = await fetch(`${frappeUrl}/api/resource/User/${userId}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'Cookie': cookieHeader,
			},
			body: JSON.stringify(updates),
		})

		const responseText = await response.text()
		console.log('Frappe update response status:', response.status)
		console.log('Frappe update response:', responseText)

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
		console.error('Profile update error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to update profile', details: errorMessage },
			{ status: 500 }
		)
	}
} 