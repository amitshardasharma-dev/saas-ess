'use client'

export function ToastProvider({ children }: { children: React.ReactNode }) {
	// No need to intercept toast globally, we'll use safeToast directly in components
	return <>{children}</>
} 