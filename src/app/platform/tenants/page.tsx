'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus, Search, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { platformService } from '@/services/platform'
import { TenantSummary, PlatformPlan, CreateTenantInput } from '@/types/platform'
import { TenantCreateWizard } from '@/components/platform/tenant-create-wizard'

const STATUS_BADGE: Record<string, string> = {
  active: 'border-green-300 text-green-700 bg-green-50',
  suspended: 'border-amber-300 text-amber-700 bg-amber-50',
  cancelled: 'border-red-300 text-red-700 bg-red-50',
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700',
  starter: 'bg-blue-100 text-blue-700',
  professional: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-orange-100 text-orange-700',
}

export default function TenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showWizard, setShowWizard] = useState(false)

  const [search, setSearch] = useState('')
  const [filterPlan, setFilterPlan] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const fetchTenants = useCallback(async () => {
    setLoading(true)
    try {
      const data = await platformService.getTenants(search || undefined, filterPlan || undefined, filterStatus || undefined)
      setTenants(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tenants')
    } finally {
      setLoading(false)
    }
  }, [search, filterPlan, filterStatus])

  useEffect(() => {
    fetchTenants()
  }, [fetchTenants])

  useEffect(() => {
    platformService.getPlans().then(setPlans).catch(() => {})
  }, [])

  const handleCreate = async (input: CreateTenantInput) => {
    try {
      await platformService.createTenant(input)
      toast.success(`Tenant "${input.company_name}" created successfully`)
      setShowWizard(false)
      fetchTenants()
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tenant')
      throw err
    }
  }

  const uniquePlans = [...new Set(tenants.map(t => t.plan))]
  const uniqueStatuses = [...new Set(tenants.map(t => t.status))]

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tenants</h1>
          <p className="text-muted-foreground mt-1">Manage all tenant organisations on the platform</p>
        </div>
        <Button onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-2" /> Create Tenant
        </Button>
      </div>

      {/* Wizard Modal — uses portal to escape overflow container */}
      {showWizard && typeof document !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: '1rem' }}
          onClick={() => setShowWizard(false)}
        >
          <div
            style={{ backgroundColor: 'white', borderRadius: '1rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', width: '100%', maxWidth: '42rem', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '1.5rem' }}>
              <h2 className="text-xl font-bold text-foreground mb-1">Create New Tenant</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Set up a new organisation with admin user and plan
              </p>
              <TenantCreateWizard
                plans={plans}
                onSubmit={handleCreate}
                onCancel={() => setShowWizard(false)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or slug..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[140px]"
              value={filterPlan}
              onChange={e => setFilterPlan(e.target.value)}
            >
              <option value="">All Plans</option>
              {uniquePlans.map(p => (
                <option key={p} value={p} className="capitalize">{p}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-[150px]"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {uniqueStatuses.map(s => (
                <option key={s} value={s} className="capitalize">{s}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-5 w-5 text-primary" />
            All Tenants
          </CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${tenants.length} tenant${tenants.length !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse h-12 bg-muted rounded-lg" />
              ))}
            </div>
          ) : tenants.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No tenants found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setShowWizard(true)}
              >
                <Plus className="h-4 w-4 mr-2" /> Create First Tenant
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Users</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(tenant => {
                    const isOverLimit = tenant.user_count > tenant.max_users
                    return (
                      <tr
                        key={tenant.id}
                        onClick={() => router.push(`/platform/tenants/${tenant.id}`)}
                        className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-foreground">{tenant.name}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{tenant.slug}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                              PLAN_COLORS[tenant.plan] || 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {tenant.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={STATUS_BADGE[tenant.status] || 'border-gray-300 text-gray-700'}
                          >
                            {tenant.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-medium ${
                              isOverLimit ? 'text-red-600' : 'text-foreground'
                            }`}
                          >
                            {tenant.user_count}
                            <span className="text-muted-foreground font-normal">
                              {' '}/{' '}{tenant.max_users}
                            </span>
                          </span>
                          {isOverLimit && (
                            <span className="ml-1 text-xs text-red-500">(over limit)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(tenant.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
