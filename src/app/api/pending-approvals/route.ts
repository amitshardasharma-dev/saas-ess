import { NextRequest, NextResponse } from 'next/server'
import config from '@/config/environment'

export async function GET(request: NextRequest) {
	try {
		console.log('Fetching Pending Approvals from Frappe...')
		
		// Get cookies from the request
		const cookieHeader = request.headers.get('cookie')
		console.log('Cookie header present:', cookieHeader ? 'Yes' : 'No')
		
		if (!cookieHeader) {
			console.log('No cookie header found')
			return NextResponse.json(
				{ error: 'Authentication required' },
				{ status: 401 }
			)
		}

		// Check authentication first
		const authResponse = await fetch(`${config.frappe.url.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
			method: 'GET',
			headers: {
				Cookie: cookieHeader,
			},
		})

		if (!authResponse.ok) {
			console.log('Authentication check failed:', authResponse.status)
			return NextResponse.json(
				{ error: 'Authentication failed' },
				{ status: 403 }
			)
		}

		const authData = await authResponse.json()
		const currentUserEmail = authData.message
		console.log('User authenticated:', currentUserEmail)

		// Get pending approvals for current user
		const pendingApprovalsUrl = `${config.frappe.url.replace(/\/$/, '')}/api/method/hr_portal.hr.doctype.leave_application.leave_application_api.get_pending_approvals`
		console.log('Making request to get pending approvals:', pendingApprovalsUrl)
		
		const pendingResponse = await fetch(pendingApprovalsUrl, {
			method: 'GET',
			headers: {
				Cookie: cookieHeader,
			},
		})

		console.log('Pending approvals response status:', pendingResponse.status)

		if (!pendingResponse.ok) {
			const errorText = await pendingResponse.text()
			console.error('Failed to fetch pending approvals:', errorText)
			return NextResponse.json(
				{ error: 'Failed to fetch pending approvals' },
				{ status: pendingResponse.status }
			)
		}

		const pendingData = await pendingResponse.json()
		console.log('Raw pending approvals data:', JSON.stringify(pendingData, null, 2))

		// Filter to only show applications where current user is the next approver
		const filteredApprovals = []
		
		if (pendingData.message && Array.isArray(pendingData.message)) {
			for (const approval of pendingData.message) {
				try {
					// Get the full leave application details to check approval chain
					const leaveDetailUrl = `${config.frappe.url.replace(/\/$/, '')}/api/resource/Leave Application/${approval.name}`
					const leaveDetailResponse = await fetch(leaveDetailUrl, {
						headers: { Cookie: cookieHeader }
					})
					
					if (leaveDetailResponse.ok) {
						const leaveDetail = await leaveDetailResponse.json()
						const approvalEntries = leaveDetail.data.leave_approval_entry || []
						
						// Sort approval entries by level_no
						approvalEntries.sort((a: any, b: any) => a.level_no - b.level_no)
						
						// Find current user's level
						const currentUserLevel = approvalEntries.find((entry: any) => 
							entry.approver === currentUserEmail && entry.status === 'Pending'
						)
						
						if (currentUserLevel) {
							// Check if all previous levels are approved
							const previousLevels = approvalEntries.filter((entry: any) => 
								entry.level_no < currentUserLevel.level_no
							)
							
							const allPreviousApproved = previousLevels.every((entry: any) => 
								entry.status === 'Approved'
							)
							
							console.log(`Application ${approval.name}: User level ${currentUserLevel.level_no}, Previous levels approved: ${allPreviousApproved}`)
							
							// Only include if all previous levels are approved (or no previous levels)
							if (allPreviousApproved) {
								filteredApprovals.push(approval)
								console.log(`✓ Including ${approval.name} - user is next approver`)
							} else {
								console.log(`✗ Excluding ${approval.name} - waiting for previous approvers`)
							}
						}
					}
				} catch (error) {
					console.error(`Error processing approval ${approval.name}:`, error)
				}
			}
		}

		console.log(`Filtered pending approvals: ${filteredApprovals.length} out of ${pendingData.message?.length || 0}`)

		return NextResponse.json({
			pending_approvals: filteredApprovals
		})
	} catch (error) {
		console.error('Pending Approvals fetch error:', error)
		
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		)
	}
} 