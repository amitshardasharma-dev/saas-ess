export interface LoginCredentials {
	usr: string
	pwd: string
	remember_me?: boolean
}

export interface User {
	name: string
	email: string
	full_name: string
	user_image?: string
	photo?: string
	roles: string[]
	employee?: string
	employee_name?: string
	department?: string
	designation?: string
	mobile_phone_no?: string
}

export interface AuthState {
	user: User | null
	isAuthenticated: boolean
	isLoading: boolean
	error: string | null
}

export interface LoginResponse {
	message: string
	home_page: string
	full_name: string
	user: string
}

export interface AuthContextType extends AuthState {
	login: (credentials: LoginCredentials) => Promise<void>
	logout: () => Promise<void>
	clearError: () => void
} 