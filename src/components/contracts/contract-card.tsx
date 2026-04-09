// src/components/contracts/contract-card.tsx

'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Download, Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { Contract, ContractStatus } from '@/types/contract'

interface ContractCardProps {
  contract: Contract
  onClick?: (contract: Contract) => void
  onDownload?: (contract: Contract) => void
  showEmployee?: boolean
}

function getStatusBadge(status: ContractStatus) {
  switch (status) {
    case 'Active':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
    case 'Expired':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Expired</Badge>
    case 'Terminated':
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Terminated</Badge>
    case 'Renewed':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Renewed</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getExpiryIndicator(contract: Contract) {
  if (contract.status !== 'Active' || !contract.end_date) return null

  const days = contract.days_until_expiry

  if (days === null || days === undefined) return null

  if (days <= 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-600">
        <XCircle className="h-3.5 w-3.5" />
        <span>Expired</span>
      </div>
    )
  }

  if (days <= 7) {
    return (
      <div className="flex items-center gap-1 text-xs text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{days}d remaining</span>
      </div>
    )
  }

  if (days <= 30) {
    return (
      <div className="flex items-center gap-1 text-xs text-amber-600">
        <Clock className="h-3.5 w-3.5" />
        <span>{days}d remaining</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-xs text-green-600">
      <CheckCircle className="h-3.5 w-3.5" />
      <span>{days}d remaining</span>
    </div>
  )
}

function getIconColor(contract: Contract) {
  if (contract.status !== 'Active') return 'bg-gray-100'
  const days = contract.days_until_expiry
  if (days === null || days === undefined || !contract.end_date) return 'bg-blue-100'
  if (days <= 7) return 'bg-red-100'
  if (days <= 30) return 'bg-amber-100'
  return 'bg-green-100'
}

function getIconTextColor(contract: Contract) {
  if (contract.status !== 'Active') return 'text-gray-600'
  const days = contract.days_until_expiry
  if (days === null || days === undefined || !contract.end_date) return 'text-blue-600'
  if (days <= 7) return 'text-red-600'
  if (days <= 30) return 'text-amber-600'
  return 'text-green-600'
}

export function ContractCard({ contract, onClick, onDownload, showEmployee = false }: ContractCardProps) {
  const expiryIndicator = getExpiryIndicator(contract)

  return (
    <Card
      className={`border-border/50 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/30' : ''}`}
      onClick={onClick ? () => onClick(contract) : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${getIconColor(contract)}`}>
              <FileText className={`h-5 w-5 ${getIconTextColor(contract)}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm truncate">{contract.title}</h3>
                {getStatusBadge(contract.status)}
              </div>
              {showEmployee && contract.employee_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{contract.employee_name}{contract.employee_no ? ` · ${contract.employee_no}` : ''}</p>
              )}
              {contract.contract_type_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{contract.contract_type_name}</p>
              )}
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  Start: {new Date(contract.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                {contract.end_date && (
                  <span className="text-xs text-muted-foreground">
                    End: {new Date(contract.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {expiryIndicator}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            {contract.file_url && onDownload && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Download contract"
                onClick={(e) => { e.stopPropagation(); onDownload(contract) }}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
