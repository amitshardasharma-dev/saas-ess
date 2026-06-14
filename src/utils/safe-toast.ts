import toast from 'react-hot-toast'

type ToastOptions = Parameters<typeof toast>[1]

// Helper function to safely convert any value to a string message
const getSafeMessage = (message: unknown): string => {
	if (typeof message === 'string') {
		return message
	}

	if (typeof message === 'object' && message !== null) {
		const obj = message as Record<string, unknown>
		// Try to extract meaningful message from object
		if (typeof obj.message === 'string') {
			return obj.message
		}
		if (typeof obj.error === 'string') {
			return obj.error
		}
		// If it's an object with message and workflow_state, extract the message
		if (obj.message && obj.workflow_state) {
			return typeof obj.message === 'string' ? obj.message : 'Operation completed'
		}
		// Fallback to JSON string representation
		try {
			return JSON.stringify(message)
		} catch {
			return 'Invalid message object'
		}
	}
	
	// Convert other types to string
	return String(message)
}

// Safe toast functions that prevent objects from being rendered
export const safeToast = {
	success: (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast.success(safeMessage, options)
	},

	error: (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast.error(safeMessage, options)
	},

	info: (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast(safeMessage, options)
	},

	loading: (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast.loading(safeMessage, options)
	},

	// Main toast function
	toast: (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast(safeMessage, options)
	}
}

// Create a safe toast wrapper that can be used as a drop-in replacement
export const createSafeToast = () => {
	const safeToastFunction = (message: unknown, options?: ToastOptions) => {
		const safeMessage = getSafeMessage(message)
		return toast(safeMessage, options)
	}
	
	// Add all the toast methods
	safeToastFunction.success = safeToast.success
	safeToastFunction.error = safeToast.error
	safeToastFunction.loading = safeToast.loading
	safeToastFunction.dismiss = toast.dismiss
	safeToastFunction.remove = toast.remove
	safeToastFunction.promise = toast.promise
	
	return safeToastFunction
}

// Export a safe toast instance
export const toast_safe = createSafeToast() 