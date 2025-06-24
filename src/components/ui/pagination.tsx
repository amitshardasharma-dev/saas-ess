import React from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

interface PaginationProps {
	currentPage: number
	totalPages: number
	onPageChange: (page: number) => void
	showFirstLast?: boolean
	maxVisiblePages?: number
}

export function Pagination({
	currentPage,
	totalPages,
	onPageChange,
	showFirstLast = true,
	maxVisiblePages = 5
}: PaginationProps) {
	if (totalPages <= 1) return null

	const getVisiblePages = () => {
		const pages: (number | 'ellipsis')[] = []
		
		if (totalPages <= maxVisiblePages) {
			// Show all pages if total is less than max visible
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i)
			}
		} else {
			// Always show first page
			pages.push(1)
			
			// Calculate start and end of visible range
			const start = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2))
			const end = Math.min(totalPages - 1, start + maxVisiblePages - 3)
			
			// Add ellipsis after first page if needed
			if (start > 2) {
				pages.push('ellipsis')
			}
			
			// Add visible pages
			for (let i = start; i <= end; i++) {
				pages.push(i)
			}
			
			// Add ellipsis before last page if needed
			if (end < totalPages - 1) {
				pages.push('ellipsis')
			}
			
			// Always show last page
			if (totalPages > 1) {
				pages.push(totalPages)
			}
		}
		
		return pages
	}

	const visiblePages = getVisiblePages()

	return (
		<div className="flex items-center justify-center space-x-2">
			{/* First page button */}
			{showFirstLast && currentPage > 1 && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(1)}
					disabled={currentPage === 1}
				>
					First
				</Button>
			)}

			{/* Previous page button */}
			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage - 1)}
				disabled={currentPage === 1}
			>
				<ChevronLeft className="h-4 w-4" />
				Previous
			</Button>

			{/* Page numbers */}
			{visiblePages.map((page, index) => (
				<React.Fragment key={index}>
					{page === 'ellipsis' ? (
						<div className="flex items-center justify-center w-8 h-8">
							<MoreHorizontal className="h-4 w-4 text-muted-foreground" />
						</div>
					) : (
						<Button
							variant={currentPage === page ? "default" : "outline"}
							size="sm"
							onClick={() => onPageChange(page)}
							className="w-8 h-8 p-0"
						>
							{page}
						</Button>
					)}
				</React.Fragment>
			))}

			{/* Next page button */}
			<Button
				variant="outline"
				size="sm"
				onClick={() => onPageChange(currentPage + 1)}
				disabled={currentPage === totalPages}
			>
				Next
				<ChevronRight className="h-4 w-4" />
			</Button>

			{/* Last page button */}
			{showFirstLast && currentPage < totalPages && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => onPageChange(totalPages)}
					disabled={currentPage === totalPages}
				>
					Last
				</Button>
			)}
		</div>
	)
}

interface PaginationInfoProps {
	currentPage: number
	itemsPerPage: number
	totalItems: number
	itemName?: string
}

export function PaginationInfo({
	currentPage,
	itemsPerPage,
	totalItems,
	itemName = 'items'
}: PaginationInfoProps) {
	const startItem = (currentPage - 1) * itemsPerPage + 1
	const endItem = Math.min(currentPage * itemsPerPage, totalItems)

	if (totalItems === 0) {
		return (
			<div className="text-sm text-muted-foreground">
				No {itemName} found
			</div>
		)
	}

	return (
		<div className="text-sm text-muted-foreground">
			Showing {startItem} to {endItem} of {totalItems} {itemName}
		</div>
	)
} 