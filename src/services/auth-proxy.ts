import { LoginCredentials, LoginResponse, User } from '@/types/auth'

interface AuthUserResponse {
	user: User | null
	authenticated: boolean
}

export class ProxyAuthService {
	private static instance: ProxyAuthService

	private constructor() {}

	static getInstance(): ProxyAuthService {
		if (!ProxyAuthService.instance) {
			ProxyAuthService.instance = new ProxyAuthService()
		}
		return ProxyAuthService.instance
	}

	private getToken(): string | null {
		if (typeof window === 'undefined') return null
		return localStorage.getItem('ess_access_token')
	}

	private setTokens(accessToken: string, refreshToken: string) {
		localStorage.setItem('ess_access_token', accessToken)
		localStorage.setItem('ess_refresh_token', refreshToken)
	}

	private clearTokens() {
		localStorage.removeItem('ess_access_token')
		localStorage.removeItem('ess_refresh_token')
		localStorage.removeItem('remember_me')
		// Drop the cached per-tenant module set so the next user (e.g. a
		// different tenant on a shared browser) never inherits stale nav.
		localStorage.removeItem('ess_modules_enabled')
		localStorage.removeItem('ess_branding')
	}

	async login(credentials: LoginCredentials): Promise<LoginResponse> {
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					usr: credentials.usr,
					pwd: credentials.pwd,
				}),
			})

			const data = await response.json()

			if (!response.ok) {
				throw new Error(data.message || 'Login failed')
			}

			if (data.message === 'Logged In') {
				// Store tokens
				if (data.access_token) {
					this.setTokens(data.access_token, data.refresh_token || '')
				}

				if (credentials.remember_me) {
					localStorage.setItem('remember_me', 'true')
				}

				return {
					message: data.message,
					home_page: data.home_page || '/dashboard',
					full_name: data.full_name || credentials.usr,
					user: data.user || credentials.usr,
				}
			}

			throw new Error(data.message || 'Login failed')
		} catch (error) {
			if (error instanceof Error) {
				throw error
			}
			throw new Error('Login failed. Please check your credentials.')
		}
	}

	async logout(): Promise<void> {
		try {
			const token = this.getToken()
			await fetch('/api/auth/logout', {
				method: 'POST',
				headers: {
					...(token && { Authorization: `Bearer ${token}` }),
				},
			})
		} catch (error) {
			console.error('Logout error:', error)
		} finally {
			this.clearTokens()
		}
	}

	async getCurrentUser(): Promise<User | null> {
		try {
			const token = this.getToken()
			if (!token) return null

			const response = await fetch('/api/auth/user', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				return null
			}

			const data: AuthUserResponse = await response.json()

			return data.authenticated ? data.user : null
		} catch (error) {
			console.error('Get current user error:', error)
			return null
		}
	}

	async checkSession(): Promise<boolean> {
		try {
			const token = this.getToken()
			if (!token) return false

			const response = await fetch('/api/auth/user', {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})

			if (!response.ok) {
				return false
			}

			const data: AuthUserResponse = await response.json()
			return data.authenticated
		} catch {
			return false
		}
	}
}

export const proxyAuthService = ProxyAuthService.getInstance()
