import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

export async function POST(request: NextRequest) {
	try {
		const body = await request.text()
		
		const response = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		})

		const data = await response.json()
		
		// Get the Set-Cookie header from Frappe response
		const setCookieHeader = response.headers.get('Set-Cookie')
		
		// Create Next.js response
		const nextResponse = NextResponse.json(data, { status: response.status })
		
		// Forward the Set-Cookie header if present
		if (setCookieHeader) {
			nextResponse.headers.set('Set-Cookie', setCookieHeader)
		}
		
		return nextResponse
	} catch (error) {
		console.error('Login proxy error:', error)
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 