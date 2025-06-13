import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

interface FrappeLeaveType {
	name: string
	leave_type: string
	leave_mapping_code?: string
	bc_leave_code?: string
	eligible_days?: number
	description?: string
	without_pay?: number
	leave_applicable_to_gender?: string
	once_in_service?: number
	only_for_local?: number
	min_period_of_service?: number
	doctype: string
}

interface FrappeLeaveTypesResponse {
	data: FrappeLeaveType[]
}

export async function GET(request: NextRequest) {
	try {
		// Forward cookies from the request for authentication
		const cookieHeader = request.headers.get('Cookie')
		
		console.log('Fetching Leave Types from Frappe...')
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
		
		// Use the correct field names from the doctype
		const frappeUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Type?fields=["name","leave_type","leave_mapping_code","bc_leave_code","eligible_days","description","without_pay","leave_applicable_to_gender"]`
		console.log('Making request to Frappe URL:', frappeUrl)
		
		const response = await fetch(frappeUrl, {
			method: 'GET',
			headers: {
				...(cookieHeader && { Cookie: cookieHeader }),
			},
		})

		console.log('Frappe response status:', response.status)
		console.log('Frappe response ok:', response.ok)

		if (!response.ok) {
			if (response.status === 404) {
				return NextResponse.json(
					{ error: 'Leave Types not found' },
					{ status: 404 }
				)
			}
			if (response.status === 403) {
				return NextResponse.json(
					{ error: 'Access denied to Leave Types' },
					{ status: 403 }
				)
			}
			throw new Error(`Frappe API error: ${response.status}`)
		}

		const leaveTypesData: FrappeLeaveTypesResponse = await response.json()
		console.log('Raw leave types data from Frappe:', JSON.stringify(leaveTypesData, null, 2))
		
		// Process the leave types data using correct field names
		const processedLeaveTypes = leaveTypesData.data.map(leaveType => ({
			name: leaveType.name,
			leave_type_name: leaveType.leave_type, // Use leave_type field instead of leave_type_name
			leave_mapping_code: leaveType.leave_mapping_code || '',
			bc_leave_code: leaveType.bc_leave_code || '',
			eligible_days: leaveType.eligible_days || 0,
			description: leaveType.description || '',
			without_pay: leaveType.without_pay || 0,
			leave_applicable_to_gender: leaveType.leave_applicable_to_gender || 'Both',
		}))

		console.log('Processed leave types:', JSON.stringify(processedLeaveTypes, null, 2))
		
		return NextResponse.json({
			leave_types: processedLeaveTypes
		})
	} catch (error) {
		console.error('Leave Types fetch error:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json(
			{ error: 'Failed to fetch leave types', details: errorMessage },
			{ status: 500 }
		)
	}
} 