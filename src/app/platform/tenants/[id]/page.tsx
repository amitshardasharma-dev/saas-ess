'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Building2, Users, Shield, Activity,
  ToggleLeft, ToggleRight, UserCheck, Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { platformService } from '@/services/platform'
import { TenantDetail, TenantUser } from '@/types/platform'

const ALL_MODULES = [
  { value: 'leave', label: 'Leave Management' },
  { value: 'expense', label: 'Expense Claims' },
  { value: 'timesheets', label: 'Timesheets' },
  { value: 'documents', label: 'Documents' },
  { value: 'appraisals', label: 'Appraisals' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'team_calendar', label: 'Team Calendar' },
]

const PLAN_OPTIONS = ['free', 'starter', 'professional', 'enterprise']

const STATUS_BADGE: Record<string, string> = {
  active: 'border-green-300 text-green-700 bg-green-50',
  suspended: 'border-amber-300 text-amber-700 bg-amber-50',
  cancelled: 'border-red-300 text-red-700 bg-red-50',
}

const ROLE_BADGE: Record<string, string> = {
  admin: 'border-purple-300 text-purple-700 bg-purple-50',
  hr: 'border-blue-300 text-blue-700 bg-blue-50',
  manager: 'border-teal-300 text-teal-700 bg-teal-50',
  employee: 'border-gray-300 text-gray-700 bg-gray-50',
}

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [tenant, setTenant] = useState<TenantDetail | null>(null)
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [modulesEnabled, setModulesEnabled] = useState<string[]>([])
  const [selectedPlan, setSelectedPlan] = useState('')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [tenantData, usersData] = await Promise.all([
        platformService.getTenant(id),
        platformService.getTenantUsers(id),
      ])
      setTenant(tenantData)
      setUsers(usersData)
      setModulesEnabled(tenantData.modules_enabled || [])
      setSelectedPlan(tenantData.plan)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load tenant')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleSaveModules = async () => {
    if (!tenant) return
    setSaving(true)
    try {
      await platformService.updateTenant(id, { modules_enabled: modulesEnabled })
      toast.success('Modules updated')
      setTenant(prev => prev ? { ...prev, modules_enabled: modulesEnabled } : prev)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update modules')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePlan = async () => {
    if (!tenant || selectedPlan === tenant.plan) return
    setActionLoading('plan')
    try {
      await platformService.updateTenant(id, { plan: selectedPlan })
      toast.success(`Plan changed to ${selectedPlan}`)
      setTenant(prev => prev ? { ...prev, plan: selectedPlan } : prev)
    } catch (err: any) {
      toast.error(err.message || 'Failed to change plan')
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleStatus = async () => {
    if (!tenant) return
    const newStatus = tenant.status === 'active' ? 'suspended' : 'active'
    setActionLoading('status')
    try {
      await platformService.updateTenant(id, { status: newStatus })
      toast.success(`Tenant ${newStatus === 'active' ? 'activated' : 'suspended'}`)
      setTenant(prev => prev ? { ...prev, status: newStatus } : prev)
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status')
    } finally {
      setActionLoading(null)
    }
  }

  const handleImpersonate = async () => {
    setActionLoading('impersonate')
    try {
      const { magic_link } = await platformService.impersonateTenant(id)
      if (magic_link) {
        window.open(magic_link, '_blank', 'noopener,noreferrer')
        toast.success('Magic link opened in new tab')
      } else {
        toast.error('No magic link returned')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to generate impersonation link')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    setActionLoading('delete')
    try {
      await platformService.deleteTenant(id)
      toast.success('Tenant cancelled')
      router.push('/platform/tenants')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tenant')
      setActionLoading(null)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-48 bg-muted rounded-xl" />
            <div className="h-48 bg-muted rounded-xl" />
          </div>
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="p-8">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-red-700">Tenant not found.</CardContent>
        </Card>
      </div>
    )
  }

  const isOverLimit = tenant.user_count > tenant.max_users

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/platform/tenants')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tenant.name}</h1>
          <p className="text-muted-foreground text-sm font-mono">{tenant.slug}</p>
        </div>
        <Badge
          variant="outline"
          className={STATUS_BADGE[tenant.status] || 'border-gray-300 text-gray-700'}
        >
          {tenant.status}
        </Badge>
      </div>

      {/* Delete Confirm Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Confirm Delete
              </CardTitle>
              <CardDescription>
                This will set the tenant status to &ldquo;cancelled&rdquo;. This action cannot be undone from the UI.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-foreground">
                Are you sure you want to cancel <strong>{tenant.name}</strong>?
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={actionLoading === 'delete'}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={actionLoading === 'delete'}
                >
                  {actionLoading === 'delete' ? 'Deleting...' : 'Yes, Cancel Tenant'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-5 w-5 text-primary" /> Company Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Plan</p>
                <span className="capitalize font-semibold text-foreground">{tenant.plan}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Status</p>
                <Badge
                  variant="outline"
                  className={STATUS_BADGE[tenant.status] || ''}
                >
                  {tenant.status}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Users</p>
                <span className={`font-semibold ${isOverLimit ? 'text-red-600' : 'text-foreground'}`}>
                  {tenant.user_count} / {tenant.max_users}
                  {isOverLimit && <span className="ml-1 text-xs text-red-500">(over limit)</span>}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Employees</p>
                <span className="font-semibold text-foreground">{tenant.employee_count}</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Max Storage</p>
                <span className="font-semibold text-foreground">
                  {tenant.max_storage_mb >= 1000
                    ? `${tenant.max_storage_mb / 1000} GB`
                    : `${tenant.max_storage_mb} MB`}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Created</p>
                <span className="font-semibold text-foreground">
                  {new Date(tenant.created_at).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5 text-primary" /> Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Change Plan */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Change Plan</Label>
              <div className="flex gap-2">
                <select
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={selectedPlan}
                  onChange={e => setSelectedPlan(e.target.value)}
                >
                  {PLAN_OPTIONS.map(p => (
                    <option key={p} value={p} className="capitalize">{p}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleChangePlan}
                  disabled={selectedPlan === tenant.plan || actionLoading === 'plan'}
                >
                  {actionLoading === 'plan' ? 'Saving...' : 'Apply'}
                </Button>
              </div>
            </div>

            {/* Suspend / Activate */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {tenant.status === 'active' ? 'Suspend Tenant' : 'Activate Tenant'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tenant.status === 'active'
                    ? 'Prevent users from logging in'
                    : 'Re-enable tenant access'}
                </p>
              </div>
              <Button
                variant={tenant.status === 'active' ? 'outline' : 'default'}
                size="sm"
                onClick={handleToggleStatus}
                disabled={actionLoading === 'status'}
                className={tenant.status === 'active' ? 'text-amber-600 border-amber-300 hover:bg-amber-50' : ''}
              >
                {actionLoading === 'status' ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current inline-block" />
                ) : tenant.status === 'active' ? (
                  <><ToggleLeft className="h-4 w-4 mr-1" /> Suspend</>
                ) : (
                  <><ToggleRight className="h-4 w-4 mr-1" /> Activate</>
                )}
              </Button>
            </div>

            {/* Impersonate */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">Impersonate</p>
                <p className="text-xs text-muted-foreground">Login as tenant admin in a new tab</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImpersonate}
                disabled={actionLoading === 'impersonate'}
                className="text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                {actionLoading === 'impersonate' ? (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current inline-block" />
                ) : (
                  <><UserCheck className="h-4 w-4 mr-1" /> Impersonate</>
                )}
              </Button>
            </div>

            {/* Delete */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div>
                <p className="text-sm font-medium text-red-600">Cancel Tenant</p>
                <p className="text-xs text-muted-foreground">Set status to cancelled</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={actionLoading === 'delete'}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" /> Module Access
          </CardTitle>
          <CardDescription>Toggle which modules are enabled for this tenant</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ALL_MODULES.map(mod => (
              <div
                key={mod.value}
                className={`flex items-center space-x-2 p-3 rounded-lg border transition-colors ${
                  modulesEnabled.includes(mod.value)
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border bg-muted/20'
                }`}
              >
                <Checkbox
                  id={`module-${mod.value}`}
                  checked={modulesEnabled.includes(mod.value)}
                  onCheckedChange={checked => {
                    setModulesEnabled(prev =>
                      checked
                        ? [...prev, mod.value]
                        : prev.filter(m => m !== mod.value)
                    )
                  }}
                />
                <Label
                  htmlFor={`module-${mod.value}`}
                  className="text-sm cursor-pointer leading-tight"
                >
                  {mod.label}
                </Label>
              </div>
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveModules} disabled={saving} size="sm">
              {saving ? 'Saving...' : 'Save Modules'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" /> Users
          </CardTitle>
          <CardDescription>{users.length} user{users.length !== 1 ? 's' : ''} in this tenant</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Department</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{user.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {user.employee_name || '—'}
                        {user.employee_no && (
                          <span className="ml-1 text-xs text-muted-foreground">({user.employee_no})</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={ROLE_BADGE[user.role] || 'border-gray-300 text-gray-700'}
                        >
                          {user.role}
                        </Badge>
                        {user.is_super_admin && (
                          <Badge variant="outline" className="ml-1 border-red-300 text-red-700 bg-red-50 text-xs">
                            super admin
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.department || '—'}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={
                            user.is_active
                              ? 'border-green-300 text-green-700 bg-green-50'
                              : 'border-gray-300 text-gray-500 bg-gray-50'
                          }
                        >
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
