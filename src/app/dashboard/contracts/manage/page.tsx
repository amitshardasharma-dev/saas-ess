// src/app/dashboard/contracts/manage/page.tsx

'use client'

import { useEffect, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContractCard } from '@/components/contracts/contract-card'
import { ContractHistory } from '@/components/contracts/contract-history'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuthStore } from '@/stores/auth'
import { contractService } from '@/services/contract'
import { Contract, ContractHistoryEntry, ContractStatus, ContractType } from '@/types/contract'
import {
  Settings,
  Plus,
  Upload,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
  XCircle,
  RefreshCw,
  FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

const STATUS_FILTERS: Array<{ label: string; value: ContractStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'Active' },
  { label: 'Expired', value: 'Expired' },
  { label: 'Terminated', value: 'Terminated' },
  { label: 'Renewed', value: 'Renewed' },
]

export default function ContractManagePage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()

  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'all'>('all')

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createEmployeeId, setCreateEmployeeId] = useState('')
  const [createTypeId, setCreateTypeId] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [createStartDate, setCreateStartDate] = useState('')
  const [createEndDate, setCreateEndDate] = useState('')
  const [createNotes, setCreateNotes] = useState('')

  // Per-contract UI state
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [terminatingId, setTerminatingId] = useState<string | null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)
  const [histories, setHistories] = useState<Record<string, ContractHistoryEntry[]>>({})
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null)

  // File input refs
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [contractsData, typesData] = await Promise.all([
        contractService.getContracts('all'),
        contractService.getContractTypes(),
      ])
      setContracts(contractsData)
      setContractTypes(typesData)
    } catch {
      toast.error('Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }

  const filtered = contracts.filter(c => {
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    const matchesSearch = !search ||
      (c.employee_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.employee_no || '').toLowerCase().includes(search.toLowerCase()) ||
      c.title.toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesSearch
  })

  // Contracts expiring within 30 days (active, with end_date, days_until_expiry <= 30)
  const expiringContracts = contracts.filter(c =>
    c.status === 'Active' &&
    c.end_date &&
    c.days_until_expiry !== null &&
    c.days_until_expiry !== undefined &&
    c.days_until_expiry >= 0 &&
    c.days_until_expiry <= 30
  ).sort((a, b) => (a.days_until_expiry ?? 999) - (b.days_until_expiry ?? 999))

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createEmployeeId.trim() || !createTitle.trim() || !createStartDate) {
      toast.error('Employee ID, title and start date are required')
      return
    }
    try {
      setCreating(true)
      await contractService.createContract({
        employee_id: createEmployeeId.trim(),
        contract_type_id: createTypeId || undefined,
        title: createTitle.trim(),
        start_date: createStartDate,
        end_date: createEndDate || null,
        notes: createNotes.trim() || undefined,
      })
      toast.success('Contract created')
      setCreateEmployeeId('')
      setCreateTypeId('')
      setCreateTitle('')
      setCreateStartDate('')
      setCreateEndDate('')
      setCreateNotes('')
      setShowCreateForm(false)
      await loadData()
    } catch {
      toast.error('Failed to create contract')
    } finally {
      setCreating(false)
    }
  }

  const handleUploadFile = async (contract: Contract, file: File) => {
    try {
      setUploadingId(contract.id)
      await contractService.uploadContractFile(contract.id, file)
      toast.success(`File uploaded for "${contract.title}"`)
      await loadData()
    } catch {
      toast.error('Failed to upload file')
    } finally {
      setUploadingId(null)
    }
  }

  const handleTerminate = async (contract: Contract) => {
    if (!confirm(`Terminate contract "${contract.title}"? This cannot be undone.`)) return
    try {
      setTerminatingId(contract.id)
      await contractService.terminateContract(contract.id, 'Terminated by HR')
      toast.success('Contract terminated')
      await loadData()
    } catch {
      toast.error('Failed to terminate contract')
    } finally {
      setTerminatingId(null)
    }
  }

  const handleRenew = async (contract: Contract) => {
    const newEnd = prompt('Enter new end date (YYYY-MM-DD) or leave blank for open-ended:')
    if (newEnd === null) return // cancelled
    try {
      await contractService.renewContract(contract.id, {
        start_date: new Date().toISOString().split('T')[0],
        end_date: newEnd.trim() || null,
        notes: 'Renewed by HR',
      })
      toast.success('Contract renewed')
      await loadData()
    } catch {
      toast.error('Failed to renew contract')
    }
  }

  const handleToggleHistory = async (contract: Contract) => {
    if (expandedHistoryId === contract.id) {
      setExpandedHistoryId(null)
      return
    }
    setExpandedHistoryId(contract.id)
    if (!histories[contract.id]) {
      try {
        setLoadingHistoryId(contract.id)
        const entries = await contractService.getContractHistory(contract.id)
        setHistories(prev => ({ ...prev, [contract.id]: entries }))
      } catch {
        toast.error('Failed to load history')
        setExpandedHistoryId(null)
      } finally {
        setLoadingHistoryId(null)
      }
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        {/* Header */}
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center space-x-3">
                <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/contracts')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Settings className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Contract Management</h1>
                  <p className="text-muted-foreground text-sm">Create, manage, and track all employee contracts</p>
                </div>
              </div>
              <Button onClick={() => setShowCreateForm(v => !v)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Contract
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

          {/* Expiry Dashboard */}
          {expiringContracts.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <AlertTriangle className="h-4 w-4" />
                  Expiring Soon ({expiringContracts.length} contract{expiringContracts.length > 1 ? 's' : ''} within 30 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {expiringContracts.map(c => (
                    <div
                      key={c.id}
                      className="bg-white rounded-lg p-3 border border-amber-200 text-sm"
                    >
                      <div className="font-medium truncate">{c.employee_name || 'Unknown'}</div>
                      <div className="text-muted-foreground text-xs truncate">{c.title}</div>
                      <div className={`text-xs font-medium mt-1 ${(c.days_until_expiry ?? 99) <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                        {c.days_until_expiry === 0 ? 'Expires today' : `${c.days_until_expiry} day${c.days_until_expiry === 1 ? '' : 's'} remaining`}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Create Contract Form */}
          {showCreateForm && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  New Contract
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Employee ID <span className="text-red-500">*</span></label>
                      <Input
                        value={createEmployeeId}
                        onChange={e => setCreateEmployeeId(e.target.value)}
                        placeholder="Employee UUID"
                        required
                      />
                      <p className="text-xs text-muted-foreground">Enter the employee&apos;s system ID</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Contract Type</label>
                      <select
                        value={createTypeId}
                        onChange={e => setCreateTypeId(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">— No Type —</option>
                        {contractTypes.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Title <span className="text-red-500">*</span></label>
                      <Input
                        value={createTitle}
                        onChange={e => setCreateTitle(e.target.value)}
                        placeholder="e.g. Permanent Employment Contract"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Start Date <span className="text-red-500">*</span></label>
                      <Input
                        type="date"
                        value={createStartDate}
                        onChange={e => setCreateStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">End Date</label>
                      <Input
                        type="date"
                        value={createEndDate}
                        onChange={e => setCreateEndDate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Leave blank for open-ended contracts</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Notes</label>
                    <textarea
                      value={createNotes}
                      onChange={e => setCreateNotes(e.target.value)}
                      placeholder="Any additional notes..."
                      rows={2}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)} disabled={creating}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating}>
                      {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      {creating ? 'Creating...' : 'Create Contract'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by employee or title..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(f => (
                <Badge
                  key={f.value}
                  variant={statusFilter === f.value ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setStatusFilter(f.value)}
                >
                  {f.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Contract List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse h-24 bg-muted rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium">No contracts found</p>
              {contracts.length > 0 && <p className="text-sm">Try adjusting your filters.</p>}
              {contracts.length === 0 && <p className="text-sm">Click &quot;Create Contract&quot; to add the first contract.</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(contract => (
                <Card key={contract.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    {/* Contract info row */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-start space-x-3 flex-1 min-w-0">
                        <div className="p-2 rounded-lg bg-blue-100 shrink-0">
                          <FileText className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-sm">{contract.title}</h3>
                            <Badge
                              variant="outline"
                              className={
                                contract.status === 'Active' ? 'text-green-700 border-green-300 bg-green-50' :
                                contract.status === 'Expired' ? 'text-red-700 border-red-300 bg-red-50' :
                                contract.status === 'Terminated' ? 'text-gray-700 border-gray-300 bg-gray-50' :
                                'text-blue-700 border-blue-300 bg-blue-50'
                              }
                            >
                              {contract.status}
                            </Badge>
                          </div>
                          {contract.employee_name && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {contract.employee_name}{contract.employee_no ? ` · ${contract.employee_no}` : ''}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-muted-foreground">
                            {contract.contract_type_name && <span>{contract.contract_type_name}</span>}
                            <span>
                              {new Date(contract.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {contract.end_date && ` – ${new Date(contract.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                            </span>
                            {contract.status === 'Active' && contract.end_date && contract.days_until_expiry !== null && contract.days_until_expiry !== undefined && (
                              <span className={(contract.days_until_expiry ?? 99) <= 7 ? 'text-red-600 font-medium' : (contract.days_until_expiry ?? 99) <= 30 ? 'text-amber-600 font-medium' : 'text-green-600'}>
                                {contract.days_until_expiry <= 0 ? 'Expired' : `${contract.days_until_expiry}d remaining`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {/* Upload file */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRefs.current[contract.id]?.click()}
                          disabled={uploadingId === contract.id}
                        >
                          {uploadingId === contract.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-1" />
                          )}
                          {uploadingId === contract.id ? 'Uploading...' : contract.file_url ? 'Replace File' : 'Upload File'}
                        </Button>
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx"
                          ref={el => { fileInputRefs.current[contract.id] = el }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) handleUploadFile(contract, file)
                            if (e.target) e.target.value = ''
                          }}
                        />

                        {/* Download if file exists */}
                        {contract.file_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(contract.file_url!, '_blank')}
                          >
                            Download
                          </Button>
                        )}

                        {/* Renew */}
                        {contract.status === 'Active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenew(contract)}
                          >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            Renew
                          </Button>
                        )}

                        {/* Terminate */}
                        {(contract.status === 'Active' || contract.status === 'Renewed') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                            onClick={() => handleTerminate(contract)}
                            disabled={terminatingId === contract.id}
                          >
                            {terminatingId === contract.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4 mr-1" />
                            )}
                            Terminate
                          </Button>
                        )}

                        {/* History toggle */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleHistory(contract)}
                        >
                          {expandedHistoryId === contract.id ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* History panel */}
                    {expandedHistoryId === contract.id && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="text-sm font-semibold mb-3">Contract History</h4>
                        {loadingHistoryId === contract.id ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          </div>
                        ) : (
                          <ContractHistory entries={histories[contract.id] || []} />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
