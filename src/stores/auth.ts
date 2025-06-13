import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AuthState, LoginCredentials } from '@/types/auth'
import { proxyAuthService } from '@/services/auth-proxy'

interface AuthStore extends AuthState {
	login: (credentials: LoginCredentials) => Promise<void>
	logout: () => Promise<void>
	checkAuth: () => Promise<void>
	clearError: () => void
	updateUserPhoto: (photoUrl: string) => Promise<void>
	updateUserInfo: (info: Partial<any>) => Promise<void>
	changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

export const useAuthStore = create<AuthStore>()(
	persist(
		(set) => ({
			user: null,
			isAuthenticated: false,
			isLoading: false,
			error: null,

			login: async (credentials: LoginCredentials) => {
				set({ isLoading: true, error: null })
				
				try {
					await proxyAuthService.login(credentials)
					const user = await proxyAuthService.getCurrentUser()
					
					set({
						user,
						isAuthenticated: true,
						isLoading: false,
						error: null,
					})
				} catch (error) {
					set({
						user: null,
						isAuthenticated: false,
						isLoading: false,
						error: error instanceof Error ? error.message : 'Login failed',
					})
					throw error
				}
			},

			logout: async () => {
				set({ isLoading: true })
				
				try {
					await proxyAuthService.logout()
				} catch (error) {
					console.error('Logout error:', error)
				} finally {
					set({
						user: null,
						isAuthenticated: false,
						isLoading: false,
						error: null,
					})
				}
			},

			checkAuth: async () => {
				set({ isLoading: true })
				
				try {
					const isSessionValid = await proxyAuthService.checkSession()
					
					if (isSessionValid) {
						const user = await proxyAuthService.getCurrentUser()
						set({
							user,
							isAuthenticated: true,
							isLoading: false,
						})
					} else {
						set({
							user: null,
							isAuthenticated: false,
							isLoading: false,
						})
					}
				} catch (error) {
					set({
						user: null,
						isAuthenticated: false,
						isLoading: false,
						error: error instanceof Error ? error.message : 'Session check failed',
					})
				}
			},

			clearError: () => {
				set({ error: null })
			},

			updateUserPhoto: async (photoUrl: string) => {
				set({ isLoading: true })
				
				try {
					// Simulate API call - replace with actual photo update logic
					await new Promise(resolve => setTimeout(resolve, 1000))
					
					// Update user in state with both photo and user_image fields
					set((state) => ({
						...state,
						user: state.user ? { 
							...state.user, 
							photo: photoUrl, 
							user_image: photoUrl 
						} : null,
						isLoading: false,
					}))
					
					console.log('Updated user state with photo URL:', photoUrl)
				} catch (error) {
					set({ isLoading: false })
					throw error
				}
			},

			updateUserInfo: async (info: Partial<any>) => {
				set({ isLoading: true })
				
				try {
					// Simulate API call - replace with actual user info update logic
					await new Promise(resolve => setTimeout(resolve, 1000))
					
					// Update user in state
					set((state) => ({
						...state,
						user: state.user ? { ...state.user, ...info } : null,
						isLoading: false,
					}))
				} catch (error) {
					set({ isLoading: false })
					throw error
				}
			},

			changePassword: async (currentPassword: string, newPassword: string) => {
				set({ isLoading: true })
				
				try {
					// Simulate API call - replace with actual password change logic
					await new Promise(resolve => setTimeout(resolve, 1000))
					
					// Password change doesn't update state, just completes
					set({ isLoading: false })
				} catch (error) {
					set({ isLoading: false })
					throw error
				}
			},
		}),
		{
			name: 'auth-storage',
			partialize: (state) => ({
				user: state.user,
				isAuthenticated: state.isAuthenticated,
			}),
		}
	)
) 