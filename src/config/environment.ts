export const config = {
	supabase: {
		url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
		anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
		serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
	},
	app: {
		name: process.env.NEXT_PUBLIC_APP_NAME || 'ESS System',
		description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Employee Self Service System',
		url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
	},
	auth: {
		sessionTimeout: parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT || '3600000'),
		rememberMeDays: parseInt(process.env.NEXT_PUBLIC_REMEMBER_ME_DAYS || '30'),
	},
	development: {
		debug: process.env.NEXT_PUBLIC_DEBUG === 'true',
		nodeEnv: process.env.NODE_ENV || 'development',
	},
}

export default config
