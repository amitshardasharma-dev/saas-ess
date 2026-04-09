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
		const { new_password } = body

		if (!new_password) {
			return NextResponse.json(
				{ error: 'Missing new_password' },
				{ status: 400 }
			)
		}

		if (new_password.length < 6) {
			return NextResponse.json(
				{ error: 'Password must be at least 6 characters' },
				{ status: 400 }
			)
		}

		// Use admin client to update the user's password
		const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
			user.id,
			{ password: new_password }
		)

		if (updateError) {
			return NextResponse.json(
				{ error: updateError.message },
				{ status: 400 }
			)
		}

		return NextResponse.json({ message: 'Password changed successfully' })
	} catch (error) {
		console.error('Password change error:', error)
		return NextResponse.json(
			{ error: 'Failed to change password' },
			{ status: 500 }
		)
	}
}
