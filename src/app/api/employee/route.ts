import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeUser {
	name: string
	email: string
	full_name?: string
	employee?: string
	user_image?: string
}

// interface FrappeUserResponse {
// 	data: FrappeUser
// }

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
			
			// Try to get basic employee record with additional fields including approval permissions
			// Note: employee_name field is not permitted in queries, so we exclude it from the filter query
			const fields = encodeURIComponent('["name","user_id","bc_employee_id","leave_approval_enabled","expense_approval_enabled"]')
			const filters = encodeURIComponent(`[["user_id","=","${authData.message}"]]`)
			const employeeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee?fields=${fields}&filters=${filters}`
			
			// Use employee_id from user data if available, otherwise try employee field
			let employeeName = user.employee_id || user.employee || 'Unknown';
			let bcEmployeeId = '';
			let actualEmployeeName = '';
			let leaveApprovalEnabled = 0;
			let expenseApprovalEnabled = 0;
			
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
				
				console.log('Employee API response status:', empResponse.status)
				if (empResponse.ok) {
					const empData = await empResponse.json()
					console.log('Raw employee data from Frappe:', JSON.stringify(empData, null, 2))
					
					if (empData.data && empData.data.length > 0) {
						const emp = empData.data[0]
						employeeName = emp.name
						bcEmployeeId = emp.bc_employee_id || ''
						leaveApprovalEnabled = emp.leave_approval_enabled || 0
						expenseApprovalEnabled = emp.expense_approval_enabled || 0
						
						console.log('Employee record found:', { 
							employeeName, 
							bcEmployeeId, 
							leaveApprovalEnabled,
							expenseApprovalEnabled
						})
						console.log('Raw approval values from Frappe:', {
							leave_approval_enabled: emp.leave_approval_enabled,
							expense_approval_enabled: emp.expense_approval_enabled
						})
						
						// If we found the employee record, try to get the full name from direct fetch
						try {
							const directEmpResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/resource/Employee/${employeeName}`, {
								method: 'GET',
								headers: {
									...(cookieHeader && { Cookie: cookieHeader }),
								},
							})
							
							if (directEmpResponse.ok) {
								const directEmpData = await directEmpResponse.json()
								actualEmployeeName = directEmpData.data.first_name || directEmpData.data.full_name || ''
								console.log('Got employee name from direct fetch:', actualEmployeeName)
							}
						} catch (directError) {
							console.log('Direct employee fetch failed:', directError)
						}
					} else {
						console.log('No employee records found in response')
					}
				} else {
					const errorText = await empResponse.text()
					console.log('Employee API error:', errorText)
				}
			} catch (empError) {
				console.log('Employee record fetch failed, using user data:', empError)
			}
			
			const responseData = {
				employee: {
					name: employeeName,
					employee_name: actualEmployeeName || user.full_name || user.name || employeeName,
					user_id: user.name,
					employee_id: user.employee_id || user.employee || employeeName,
					full_name: user.full_name || '',
					bc_employee_id: bcEmployeeId,
					company: '', // Not available due to permissions
					department: '', // Not available due to permissions
					leave_approval_enabled: leaveApprovalEnabled,
					expense_approval_enabled: expenseApprovalEnabled
				}
			}
			
			console.log('Final response data:', JSON.stringify(responseData, null, 2))
			
			const response = NextResponse.json(responseData)
			
			// Add cache-busting headers
			response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
			response.headers.set('Pragma', 'no-cache')
			response.headers.set('Expires', '0')
			response.headers.set('Surrogate-Control', 'no-store')
			
			return response
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