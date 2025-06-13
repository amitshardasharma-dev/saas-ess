import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeUser {
	name: string
	email: string
	full_name?: string
	employee?: string
	user_image?: string
}

interface FrappeUserResponse {
	data: FrappeUser
}

export async function GET(request: NextRequest) {
	try {
		// Forward cookies from the request for authentication
		const cookieHeader = request.headers.get('Cookie')
		
		console.log('Fetching Current Employee from Frappe...')
		console.log('Cookie header present:', cookieHeader ? 'Yes' : 'No')
		
		// First check if user is authenticated
		const authResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		if (!authResponse.ok) {
			console.log('Authentication check failed:', authResponse.status)
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		const authData = await authResponse.json()
		if (!authData.message || authData.message === 'Guest') {
			console.log('User not authenticated, message:', authData.message)
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		console.log('User authenticated:', authData.message)
		
		// Get user details from auth/user endpoint which has more accessible fields
		console.log('Getting user details from auth endpoint...')
		const userResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/User/${authData.message}`, {
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('User response status:', userResponse.status)
		console.log('User response ok:', userResponse.ok)

		if (!userResponse.ok) {
			const errorBody = await userResponse.text()
			console.log('User API error body:', errorBody)
			
			if (userResponse.status === 404) {
				return NextResponse.json(
					{ error: 'User not found' },
					{ status: 404 }
				)
			}
			if (userResponse.status === 403) {
				return NextResponse.json(
					{ error: 'Access denied to User data' },
					{ status: 403 }
				)
			}
			throw new Error(`User API error: ${userResponse.status} - ${errorBody}`)
		}

		const userData = await userResponse.json()
		console.log('Raw user data from Frappe:', JSON.stringify(userData, null, 2))
		
		if (userData.data) {
			const user = userData.data
			console.log('Found user:', user)
			
			// Try to get basic employee record with additional fields including bc_employee_id
			const fields = encodeURIComponent('["name","user_id","bc_employee_id","employee_name"]')
			const filters = encodeURIComponent(`[["user_id","=","${authData.message}"]]`)
			const employeeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee?fields=${fields}&filters=${filters}`
			
			// Use employee_id from user data if available, otherwise try employee field
			let employeeName = user.employee_id || user.employee || 'Unknown';
			let bcEmployeeId = '';
			let actualEmployeeName = '';
			
			console.log('User employee fields:', { 
				employee_id: user.employee_id, 
				employee: user.employee,
				using: employeeName 
			})
			
			// Try to get employee record but don't fail if it doesn't work
			try {
				const empResponse = await fetch(employeeUrl, {
					method: 'GET',
					headers: {
						...(cookieHeader && { Cookie: cookieHeader }),
					},
				})
				
				if (empResponse.ok) {
					const empData = await empResponse.json()
					if (empData.data && empData.data.length > 0) {
						const emp = empData.data[0]
						employeeName = emp.name
						bcEmployeeId = emp.bc_employee_id || ''
						actualEmployeeName = emp.employee_name || ''
						console.log('Employee record found:', { employeeName, bcEmployeeId, actualEmployeeName })
					}
				}
			} catch (empError) {
				console.log('Employee record fetch failed, using user data:', empError)
			}
			
			return NextResponse.json({
				employee: {
					name: employeeName,
					employee_name: actualEmployeeName || user.full_name || user.name || employeeName,
					user_id: user.name,
					employee_id: user.employee_id || user.employee || employeeName,
					full_name: user.full_name || '',
					bc_employee_id: bcEmployeeId,
					company: '', // Not available due to permissions
					department: '', // Not available due to permissions
				}
			})
		} else {
			console.warn('No user data found for user:', authData.message)
			return NextResponse.json(
				{ error: 'No user data found for current user' },
				{ status: 404 }
			)
		}
	} catch (error) {
		console.error('Employee fetch error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to fetch employee data', details: errorMessage },
			{ status: 500 }
		)
	}
} 