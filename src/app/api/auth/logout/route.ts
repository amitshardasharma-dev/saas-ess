import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

export async function POST(request: NextRequest) {
	try {
		// Forward cookies from the request
		const cookieHeader = request.headers.get('Cookie')
		
		const response = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/logout`, {
			method: 'POST',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		const data = await response.json()
		
		// Get the Set-Cookie header from Frappe response (to clear cookies)
		const setCookieHeader = response.headers.get('Set-Cookie')
		
		// Create Next.js response
		const nextResponse = NextResponse.json(data, { status: response.status })
		
		// Forward the Set-Cookie header if present
		if (setCookieHeader) {
			nextResponse.headers.set('Set-Cookie', setCookieHeader)
		}
		
		return nextResponse
	} catch (error) {
		console.error('Logout proxy error:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 