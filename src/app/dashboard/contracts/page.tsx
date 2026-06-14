// src/app/dashboard/contracts/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ContractCard } from '@/components/contracts/contract-card'
import { ContractHistory } from '@/components/contracts/contract-history'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { contractService } from '@/services/contract'
import { Contract, ContractHistoryEntry } from '@/types/contract'
import { FileText, Download, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function MyContractPage() {
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<ContractHistoryEntry[]>([])
  const [historyContractId, setHistoryContractId] = useState<string | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await contractService.getContracts('my')
      setContracts(data)
    } catch {
      toast.error('Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (contract: Contract) => {
    if (contract.file_url) {
      window.open(contract.file_url, '_blank')
    }
  }

  const handleToggleHistory = async (contract: Contract) => {
    if (historyContractId === contract.id && showHistory) {
      setShowHistory(false)
      return
    }
    setHistoryContractId(contract.id)
    setShowHistory(true)
    if (historyContractId !== contract.id) {
      try {
        setLoadingHistory(true)
        const entries = await contractService.getContractHistory(contract.id)
        setHistory(entries)
      } catch {
        toast.error('Failed to load contract history')
      } finally {
        setLoadingHistory(false)
      }
    }
  }

  const activeContract = contracts.find(c => c.status === 'Active')
  const pastContracts = contracts.filter(c => c.status !== 'Active')

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        {/* Header */}
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">My Contract</h1>
                <p className="text-muted-foreground text-sm">View your employment contract details</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          {loading ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse h-24 bg-muted rounded-xl" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-base font-medium">No contracts found</p>
              <p className="text-sm">Contact HR if you believe this is incorrect.</p>
            </div>
          ) : (
            <>
              {/* Current Active Contract */}
              {activeContract ? (
                <section>
                  <h2 className="text-lg font-semibold mb-3">Current Contract</h2>
                  <Card className="border-primary/20 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xl font-bold">{activeContract.title}</h3>
                            <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                          </div>
                          {activeContract.contract_type_name && (
                            <p className="text-sm text-muted-foreground">{activeContract.contract_type_name}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-sm pt-1">
                            <div>
                              <span className="text-muted-foreground">Start date: </span>
                              <span className="font-medium">
                                {new Date(activeContract.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                            </div>
                            {activeContract.end_date && (
                              <div>
                                <span className="text-muted-foreground">End date: </span>
                                <span className="font-medium">
                                  {new Date(activeContract.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                              </div>
                            )}
                            {activeContract.days_until_expiry !== null && activeContract.days_until_expiry !== undefined && activeContract.end_date && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className={activeContract.days_until_expiry <= 7 ? 'text-red-600 font-medium' : activeContract.days_until_expiry <= 30 ? 'text-amber-600 font-medium' : 'text-green-600 font-medium'}>
                                  {activeContract.days_until_expiry <= 0 ? 'Expired' : `${activeContract.days_until_expiry} days remaining`}
                                </span>
                              </div>
                            )}
                          </div>
                          {activeContract.notes && (
                            <p className="text-sm text-muted-foreground pt-1">{activeContract.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          {activeContract.file_url && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownload(activeContract)}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Download Contract
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleHistory(activeContract)}
                          >
                            {showHistory && historyContractId === activeContract.id ? (
                              <><ChevronUp className="h-4 w-4 mr-1" />Hide History</>
                            ) : (
                              <><ChevronDown className="h-4 w-4 mr-1" />View History</>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* History panel */}
                      {showHistory && historyContractId === activeContract.id && (
                        <div className="mt-6 border-t pt-6">
                          <h4 className="text-sm font-semibold mb-4">Contract History</h4>
                          {loadingHistory ? (
                            <div className="space-y-2">
                              {[...Array(3)].map((_, i) => <div key={i} className="animate-pulse h-8 bg-muted rounded" />)}
                            </div>
                          ) : (
                            <ContractHistory entries={history} />
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </section>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  No active contract found. Contact HR if you believe this is incorrect.
                </div>
              )}

              {/* Past Contracts */}
              {pastContracts.length > 0 && (
                <section>
                  <h2 className="text-lg font-semibold mb-3">Past Contracts</h2>
                  <div className="space-y-3">
                    {pastContracts.map(contract => (
                      <ContractCard
                        key={contract.id}
                        contract={contract}
                        onDownload={contract.file_url ? handleDownload : undefined}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
