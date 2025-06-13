import { LoginCredentials, LoginResponse, User } from '@/types/auth'
import config from '@/config/environment'

export class AuthService {
	private static instance: AuthService
	private baseUrl: string
	
	private constructor() {
		this.baseUrl = config.frappe.url
	}
	
	static getInstance(): AuthService {
		if (!AuthService.instance) {
			AuthService.instance = new AuthService()
		}
		return AuthService.instance
	}

	async login(credentials: LoginCredentials): Promise<LoginResponse> {
		try {
			const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/method/login`, {
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

			const data = await response.json()
			
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
				throw new Error(error.message)
			}
			throw new Error('Login failed. Please check your credentials.')
		}
	}

	async logout(): Promise<void> {
		try {
			await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/method/logout`, {
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
			const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
				credentials: 'include',
			})
			
			const data = await response.json()
			
			if (data.message && data.message !== 'Guest') {
				// Get user details
				const userResponse = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/resource/User/${data.message}`, {
					credentials: 'include',
				})
				
				const userDoc = await userResponse.json()
				
				return {
					name: userDoc.data.name,
					email: userDoc.data.email,
					full_name: userDoc.data.full_name,
					user_image: userDoc.data.user_image,
					roles: userDoc.data.roles?.map((role: { role: string }) => role.role) || [],
					employee: userDoc.data.employee,
					employee_name: userDoc.data.employee_name,
					department: userDoc.data.department,
					designation: userDoc.data.designation,
				}
			}
			
			return null
		} catch (error) {
			console.error('Get current user error:', error)
			return null
		}
	}

	async checkSession(): Promise<boolean> {
		try {
			const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/method/frappe.auth.get_logged_user`, {
				credentials: 'include',
			})
			const data = await response.json()
			return data.message && data.message !== 'Guest'
		} catch {
			return false
		}
	}
}

export const authService = AuthService.getInstance() 