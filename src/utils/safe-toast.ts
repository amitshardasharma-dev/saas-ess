import toast from 'react-hot-toast'

// Helper function to safely convert any value to a string message
const getSafeMessage = (message: any): string => {
	if (typeof message === 'string') {
		return message
	}
	
	if (typeof message === 'object' && message !== null) {
		// Try to extract meaningful message from object
		if (message.message && typeof message.message === 'string') {
			return message.message
		}
		if (message.error && typeof message.error === 'string') {
			return message.error
		}
		// If it's an object with message and workflow_state, extract the message
		if (message.message && message.workflow_state) {
			return typeof message.message === 'string' ? message.message : 'Operation completed'
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
	success: (message: any, options?: any) => {
		const safeMessage = getSafeMessage(message)
		return toast.success(safeMessage, options)
	},
	
	error: (message: any, options?: any) => {
		const safeMessage = getSafeMessage(message)
		return toast.error(safeMessage, options)
	},
	
	info: (message: any, options?: any) => {
		const safeMessage = getSafeMessage(message)
		return toast(safeMessage, options)
	},
	
	loading: (message: any, options?: any) => {
		const safeMessage = getSafeMessage(message)
		return toast.loading(safeMessage, options)
	},
	
	// Main toast function
	toast: (message: any, options?: any) => {
		const safeMessage = getSafeMessage(message)
		return toast(safeMessage, options)
	}
}

// Create a safe toast wrapper that can be used as a drop-in replacement
export const createSafeToast = () => {
	const safeToastFunction = (message: any, options?: any) => {
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