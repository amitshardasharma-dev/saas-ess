import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabase-admin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Re-exported from supabase-admin (no next/headers) so existing API-route
// imports (`from '@/lib/supabase-server'`) keep working unchanged.
export { supabaseAdmin }

// Server client — respects RLS via user's session cookie
export async function createSupabaseServer() {
	const cookieStore = await cookies()

	return createServerClient(supabaseUrl, supabaseAnonKey, {
		cookies: {
			getAll() {
				return cookieStore.getAll()
			},
			setAll(cookiesToSet) {
				try {
					cookiesToSet.forEach(({ name, value, options }) =>
						cookieStore.set(name, value, options)
					)
				} catch {
					// Called from Server Component — ignore
				}
			},
		},
	})
}

// Helper: get current authenticated user from request
export async function getAuthUser() {
	const supabase = await createSupabaseServer()
	const { data: { user }, error } = await supabase.auth.getUser()
	if (error || !user) return null
	return user
}

// Helper: get current user's employee record + company
export async function getEmployeeFromAuth() {
	const user = await getAuthUser()
	if (!user) return null

	const { data: appUser } = await supabaseAdmin
		.from('ess_app_users')
		.select('id, company_id, role, is_active')
		.eq('auth_user_id', user.id)
		.eq('is_active', true)
		.single()

	if (!appUser) return null

	const { data: employee } = await supabaseAdmin
		.from('ess_employees')
		.select('*')
		.eq('app_user_id', appUser.id)
		.single()

	return {
		user,
		appUser,
		employee,
		companyId: appUser.company_id,
		role: appUser.role,
	}
}
