export const config = {
	frappe: {
		url: process.env.NEXT_PUBLIC_FRAPPE_URL || 'http://localhost:8000',
		siteName: process.env.NEXT_PUBLIC_FRAPPE_SITE_NAME || 'localhost',
		apiVersion: process.env.NEXT_PUBLIC_API_VERSION || 'v1',
		timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000'),
	},
	app: {
		name: process.env.NEXT_PUBLIC_APP_NAME || 'ESS System',
		description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Employee Self Service System',
		url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
	},
	auth: {
		sessionTimeout: parseInt(process.env.NEXT_PUBLIC_SESSION_TIMEOUT || '3600000'),
		rememberMeDays: parseInt(process.env.NEXT_PUBLIC_REMEMBER_ME_DAYS || '30'),
		secret: process.env.NEXTAUTH_SECRET || 'default-secret-change-in-production',
	},
	development: {
		debug: process.env.NEXT_PUBLIC_DEBUG === 'true',
		nodeEnv: process.env.NODE_ENV || 'development',
	},
}

export default config 