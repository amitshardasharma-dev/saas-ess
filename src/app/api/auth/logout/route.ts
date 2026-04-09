import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
	try {
		const supabase = await createSupabaseServer()
		await supabase.auth.signOut()

		return NextResponse.json({ message: 'Logged out' })
	} catch (error) {
		console.error('Logout error:', error)
		return NextResponse.json(
			{ message: 'Logged out' },
			{ status: 200 }
		)
	}
}
