import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData()
		const frappeUrl = process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000'
		
		// Get cookies from the request for authentication
		const cookieHeader = request.headers.get('cookie') || ''
		
		const response = await fetch(`${frappeUrl}/api/method/upload_file`, {
			method: 'POST',
			headers: {
				'Cookie': cookieHeader,
				// Don't set Content-Type for FormData - let the browser set it with boundary
			},
			body: formData,
		})

		const responseText = await response.text()
		console.log('Frappe upload response status:', response.status)
		console.log('Frappe upload response:', responseText)

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
		console.error('Photo upload error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to upload photo', details: errorMessage },
			{ status: 500 }
		)
	}
} 