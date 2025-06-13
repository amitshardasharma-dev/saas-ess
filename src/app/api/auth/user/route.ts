import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeUserDoc {
	data: {
		name: string
		email: string
		full_name: string
		user_image?: string
		roles?: Array<{ role: string }>
		employee?: string
		employee_name?: string
		department?: string
		designation?: string
		employee_id?: string
	}
}

interface FrappeAuthResponse {
	message: string
}

export async function GET(request: NextRequest) {
	try {
		// Forward cookies from the request
		const cookieHeader = request.headers.get('Cookie')
		
		const response = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!response.ok) {
			return NextResponse.json({ user: null, authenticated: false })
		}

		const data: FrappeAuthResponse = await response.json()
		
		if (data.message && data.message !== 'Guest') {
			// Get user details
			const userResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/User/${data.message}`, {
				headers: {
					...(cookieHeader && { Cookie: cookieHeader }),
				},
			})
			
			if (userResponse.ok) {
				const userDoc: FrappeUserDoc = await userResponse.json()
				
				const user = {
					name: userDoc.data.name,
					email: userDoc.data.email,
					full_name: userDoc.data.full_name,
					user_image: userDoc.data.user_image,
					roles: userDoc.data.roles?.map((role) => role.role) || [],
					employee: userDoc.data.employee_id,
					employee_name: userDoc.data.employee_name,
					department: userDoc.data.department,
					designation: userDoc.data.designation,
				}
				
				return NextResponse.json({ user, authenticated: true })
			}
		}
		
		return NextResponse.json({ user: null, authenticated: false })
	} catch (error) {
		console.error('User proxy error:', error)
		return NextResponse.json(
			{ user: null, authenticated: false },
			{ status: 500 }
		)
	}
} 