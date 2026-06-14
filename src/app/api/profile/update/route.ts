import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get('authorization')
		const token = authHeader?.replace('Bearer ', '')

		if (!token) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
		if (authError || !user) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		const body = await request.json()
		const { updates } = body

		if (!updates) {
			return NextResponse.json({ error: 'Missing updates' }, { status: 400 })
		}

		// Find the employee record for this auth user
		const { data: appUser } = await supabaseAdmin
			.from('ess_app_users')
			.select('id, company_id')
			.eq('auth_user_id', user.id)
			.eq('is_active', true)
			.single()

		if (!appUser) {
			return NextResponse.json({ error: 'Not registered for ESS' }, { status: 403 })
		}

		const { data: employee } = await supabaseAdmin
			.from('ess_employees')
			.select('id')
			.eq('app_user_id', appUser.id)
			.single()

		if (!employee) {
			return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
		}

		// Only allow updating specific fields
		const allowedFields = ['phone', 'full_name']
		const safeUpdates: Record<string, unknown> = {}
		for (const key of allowedFields) {
			if (updates[key] !== undefined) {
				safeUpdates[key] = updates[key]
			}
		}

		if (Object.keys(safeUpdates).length === 0) {
			return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
		}

		safeUpdates.updated_at = new Date().toISOString()

		const { data: updated, error: updateError } = await supabaseAdmin
			.from('ess_employees')
			.update(safeUpdates)
			.eq('id', employee.id)
			.select()
			.single()

		if (updateError) throw updateError

		return NextResponse.json({ message: 'Profile updated', employee: updated })
	} catch (error) {
		console.error('Profile update error:', error)
		return NextResponse.json(
			{ error: 'Failed to update profile' },
			{ status: 500 }
		)
	}
}
