import { LoginCredentials, LoginResponse, User } from '@/types/auth'

interface FrappeLoginResponse {
	message: string
	home_page?: string
	full_name?: string
}

interface FrappeUserResponse {
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

	async login(credentials: LoginCredentials): Promise<LoginResponse> {
		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				credentials: 'include',
				body: new URLSearchParams({
					usr: credentials.usr,
					pwd: credentials.pwd,
				}),
			})

			if (!response.ok) {
				throw new Error('Login request failed')
			}

			const data: FrappeLoginResponse = await response.json()
			
			if (data.message === 'Logged In') {
				// Store remember me preference
				if (credentials.remember_me) {
					localStorage.setItem('remember_me', 'true')
				}
				
				return {
					message: data.message,
					home_page: data.home_page || '/dashboard',
					full_name: data.full_name || credentials.usr,
					user: credentials.usr,
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
			await fetch('/api/auth/logout', {
				method: 'POST',
				credentials: 'include',
			})
			localStorage.removeItem('remember_me')
		} catch (error) {
			console.error('Logout error:', error)
			// Even if logout fails on server, clear local storage
			localStorage.removeItem('remember_me')
		}
	}

	async getCurrentUser(): Promise<User | null> {
		try {
			const response = await fetch('/api/auth/user', {
				credentials: 'include',
			})
			
			if (!response.ok) {
				return null
			}

			const data: FrappeUserResponse = await response.json()
			
			return data.authenticated ? data.user : null
		} catch (error) {
			console.error('Get current user error:', error)
			return null
		}
	}

	async checkSession(): Promise<boolean> {
		try {
			const response = await fetch('/api/auth/user', {
				credentials: 'include',
			})
			
			if (!response.ok) {
				return false
			}

			const data: FrappeUserResponse = await response.json()
			return data.authenticated
		} catch {
			return false
		}
	}
}

export const proxyAuthService = ProxyAuthService.getInstance() 