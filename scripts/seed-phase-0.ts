/**
 * Phase 0 seed script — idempotent.
 *
 * Ensures:
 *   - Birch Foundation tenant (slug `birch-foundation`)
 *   - A platform super-admin: superadmin@birch.org / Test1234! (is_super_admin)
 *   - A tenant-B (`acme`) so isolation tests have two tenants
 *
 * Matches the real schema (verified against the app code):
 *   ess_companies(name, slug, plan, settings, status)
 *   ess_app_users(auth_user_id, company_id, email, role, full_name, is_active,
 *                 is_super_admin)
 *
 * Idempotent: looks up auth users by email and companies by slug before insert,
 * and upserts ess_app_users by auth_user_id.
 *
 * Usage (a human runs this against a real DB — NOT during the Phase 0 build):
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npx tsx scripts/seed-phase-0.ts
 */
import { createClient } from '@supabase/supabase-js'

const SUPERADMIN_EMAIL = 'superadmin@birch.org'
const SUPERADMIN_PASSWORD = 'Test1234!'

function getClient() {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL
	const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
	if (!url || !serviceKey) {
		throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
	}
	return createClient(url, serviceKey, {
		auth: { persistSession: false, autoRefreshToken: false },
	})
}

type Supa = ReturnType<typeof getClient>

/** Find an existing auth user by email, paging through the admin list. */
async function findAuthUserByEmail(supabase: Supa, email: string): Promise<string | null> {
	for (let page = 1; page <= 50; page++) {
		const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
		if (error) throw new Error(`listUsers failed: ${error.message}`)
		const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
		if (match) return match.id
		if (data.users.length < 200) break
	}
	return null
}

async function ensureCompany(
	supabase: Supa,
	name: string,
	slug: string,
	modulesEnabled: string[],
): Promise<string> {
	const { data: existing } = await supabase
		.from('ess_companies')
		.select('id')
		.eq('slug', slug)
		.maybeSingle()
	if (existing) return existing.id as string

	const { data, error } = await supabase
		.from('ess_companies')
		.insert({
			name,
			slug,
			plan: 'enterprise',
			status: 'active',
			settings: { modules_enabled: modulesEnabled },
		})
		.select('id')
		.single()
	if (error || !data) {
		throw new Error(`Failed to create company ${slug}: ${error?.message ?? 'no row'}`)
	}
	return data.id as string
}

async function ensureAuthUser(supabase: Supa, email: string, password: string): Promise<string> {
	const existingId = await findAuthUserByEmail(supabase, email)
	if (existingId) return existingId

	const { data, error } = await supabase.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	})
	if (error || !data.user) {
		throw new Error(`Failed to create auth user ${email}: ${error?.message ?? 'no user'}`)
	}
	return data.user.id
}

async function main(): Promise<void> {
	const supabase = getClient()

	// Primary tenant + tenant-B for isolation tests.
	const birchId = await ensureCompany(supabase, 'Birch Foundation', 'birch-foundation', [
		'leave',
		'expense',
		'timesheets',
		'documents',
		'appraisals',
		'contracts',
		'team_calendar',
	])
	await ensureCompany(supabase, 'Acme Corp', 'acme', ['leave', 'expense'])

	// Super-admin auth user, anchored to the Birch tenant.
	const superAdminAuthId = await ensureAuthUser(supabase, SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD)

	const { error } = await supabase.from('ess_app_users').upsert(
		{
			auth_user_id: superAdminAuthId,
			company_id: birchId,
			email: SUPERADMIN_EMAIL,
			role: 'admin',
			full_name: 'Platform Super Admin',
			is_active: true,
			is_super_admin: true,
		},
		{ onConflict: 'auth_user_id' },
	)
	if (error) {
		throw new Error(`Failed to upsert super-admin ess_app_users row: ${error.message}`)
	}

	console.log(
		`Seed complete. Super-admin ${SUPERADMIN_EMAIL} (auth ${superAdminAuthId}) in Birch (${birchId}). Tenant-B acme ensured.`,
	)
}

main().catch((err) => {
	console.error('Seed failed:', err)
	process.exit(1)
})
