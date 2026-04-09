'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Pencil, Trash2, CreditCard, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { platformService, CreatePlanInput } from '@/services/platform'
import { PlatformPlan } from '@/types/platform'

const ALL_MODULES = [
  { value: 'leave', label: 'Leave' },
  { value: 'expense', label: 'Expense' },
  { value: 'timesheets', label: 'Timesheets' },
  { value: 'documents', label: 'Documents' },
  { value: 'appraisals', label: 'Appraisals' },
  { value: 'contracts', label: 'Contracts' },
  { value: 'team_calendar', label: 'Team Calendar' },
]

const EMPTY_FORM: CreatePlanInput = {
  name: '',
  slug: '',
  max_users: 10,
  max_storage_mb: 1000,
  modules_allowed: [],
  price_monthly: 0,
  price_yearly: 0,
  is_active: true,
  sort_order: 0,
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function formatStorage(mb: number) {
  return mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`
}

interface PlanFormProps {
  initial?: PlatformPlan | null
  onSave: (data: CreatePlanInput) => Promise<void>
  onCancel: () => void
  saving: boolean
}

function PlanForm({ initial, onSave, onCancel, saving }: PlanFormProps) {
  const [form, setForm] = useState<CreatePlanInput>(
    initial
      ? {
          name: initial.name,
          slug: initial.slug,
          max_users: initial.max_users,
          max_storage_mb: initial.max_storage_mb,
          modules_allowed: initial.modules_allowed,
          price_monthly: initial.price_monthly,
          price_yearly: initial.price_yearly,
          is_active: initial.is_active,
          sort_order: initial.sort_order,
        }
      : { ...EMPTY_FORM }
  )

  const set = (field: keyof CreatePlanInput, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleNameChange = (val: string) => {
    set('name', val)
    if (!initial) set('slug', slugify(val))
  }

  const toggleModule = (mod: string, checked: boolean) => {
    set(
      'modules_allowed',
      checked
        ? [...form.modules_allowed, mod]
        : form.modules_allowed.filter(m => m !== mod)
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.slug) {
      toast.error('Name and slug are required')
      return
    }
    await onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">Name *</Label>
          <Input
            id="plan-name"
            value={form.name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="Professional"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-slug">Slug *</Label>
          <Input
            id="plan-slug"
            value={form.slug}
            onChange={e => set('slug', e.target.value)}
            placeholder="professional"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-max-users">Max Users</Label>
          <Input
            id="plan-max-users"
            type="number"
            min={1}
            value={form.max_users}
            onChange={e => set('max_users', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-storage">Max Storage (MB)</Label>
          <Input
            id="plan-storage"
            type="number"
            min={0}
            value={form.max_storage_mb}
            onChange={e => set('max_storage_mb', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-monthly">Price Monthly ($)</Label>
          <Input
            id="plan-monthly"
            type="number"
            min={0}
            step={0.01}
            value={form.price_monthly}
            onChange={e => set('price_monthly', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-yearly">Price Yearly ($)</Label>
          <Input
            id="plan-yearly"
            type="number"
            min={0}
            step={0.01}
            value={form.price_yearly}
            onChange={e => set('price_yearly', parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-sort">Sort Order</Label>
          <Input
            id="plan-sort"
            type="number"
            value={form.sort_order ?? 0}
            onChange={e => set('sort_order', parseInt(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1.5 flex flex-col justify-end">
          <div className="flex items-center space-x-2 pb-2">
            <Checkbox
              id="plan-active"
              checked={form.is_active ?? true}
              onCheckedChange={checked => set('is_active', !!checked)}
            />
            <Label htmlFor="plan-active" className="cursor-pointer">Active</Label>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Modules Allowed</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_MODULES.map(mod => (
            <div
              key={mod.value}
              className={`flex items-center space-x-2 p-2 rounded-lg border transition-colors cursor-pointer ${
                form.modules_allowed.includes(mod.value)
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border bg-muted/20'
              }`}
            >
              <Checkbox
                id={`mod-${mod.value}`}
                checked={form.modules_allowed.includes(mod.value)}
                onCheckedChange={checked => toggleModule(mod.value, !!checked)}
              />
              <Label htmlFor={`mod-${mod.value}`} className="text-sm cursor-pointer">
                {mod.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" /> Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : <><Check className="h-4 w-4 mr-1" /> Save Plan</>}
        </Button>
      </div>
    </form>
  )
}

export default function PlansPage() {
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlatformPlan | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fetchPlans = async () => {
    setLoading(true)
    try {
      const data = await platformService.getPlans()
      setPlans(data)
    } catch (err: any) {
      toast.error(err.message || 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlans() }, [])

  const handleCreate = async (data: CreatePlanInput) => {
    setSaving(true)
    try {
      const plan = await platformService.createPlan(data)
      setPlans(prev => [...prev, plan].sort((a, b) => a.sort_order - b.sort_order))
      setShowCreateForm(false)
      toast.success('Plan created')
    } catch (err: any) {
      toast.error(err.message || 'Failed to create plan')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (data: CreatePlanInput) => {
    if (!editingPlan) return
    setSaving(true)
    try {
      const updated = await platformService.updatePlan(editingPlan.id, data)
      setPlans(prev =>
        prev.map(p => p.id === updated.id ? updated : p)
          .sort((a, b) => a.sort_order - b.sort_order)
      )
      setEditingPlan(null)
      toast.success('Plan updated')
    } catch (err: any) {
      toast.error(err.message || 'Failed to update plan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await platformService.deletePlan(id)
      setPlans(prev => prev.filter(p => p.id !== id))
      setDeleteConfirmId(null)
      toast.success('Plan deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete plan')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Plans
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage subscription plans and their feature sets
          </p>
        </div>
        {!showCreateForm && !editingPlan && (
          <Button onClick={() => setShowCreateForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> New Plan
          </Button>
        )}
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Create New Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanForm
              onSave={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              saving={saving}
            />
          </CardContent>
        </Card>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <CardTitle className="text-red-600 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Delete Plan
              </CardTitle>
              <CardDescription>
                This cannot be undone. The plan must have no tenants before it can be deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleDelete(deleteConfirmId)}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Plan'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Plans Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse h-14 bg-muted rounded-lg" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="p-12 text-center">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground">No plans yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Max Users</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Storage</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monthly</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Yearly</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modules</th>
                    <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map(plan => (
                    <>
                      <tr
                        key={plan.id}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                      >
                        <td className="px-4 py-3 font-semibold text-foreground">{plan.name}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground text-xs">{plan.slug}</td>
                        <td className="px-4 py-3 text-right text-foreground">{plan.max_users}</td>
                        <td className="px-4 py-3 text-right text-foreground">{formatStorage(plan.max_storage_mb)}</td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {plan.price_monthly === 0 ? 'Free' : `$${plan.price_monthly.toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground">
                          {plan.price_yearly === 0 ? 'Free' : `$${plan.price_yearly.toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {plan.modules_allowed.length === 0 ? (
                              <span className="text-muted-foreground text-xs">—</span>
                            ) : (
                              plan.modules_allowed.map(mod => (
                                <Badge
                                  key={mod}
                                  variant="outline"
                                  className="text-xs border-blue-200 text-blue-700 bg-blue-50 capitalize"
                                >
                                  {mod.replace('_', ' ')}
                                </Badge>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant="outline"
                            className={
                              plan.is_active
                                ? 'border-green-300 text-green-700 bg-green-50'
                                : 'border-gray-300 text-gray-500 bg-gray-50'
                            }
                          >
                            {plan.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                setEditingPlan(plan)
                                setShowCreateForm(false)
                              }}
                              title="Edit plan"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                              onClick={() => setDeleteConfirmId(plan.id)}
                              title="Delete plan"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {editingPlan?.id === plan.id && (
                        <tr key={`edit-${plan.id}`} className="bg-muted/10 border-b border-primary/20">
                          <td colSpan={9} className="px-4 py-4">
                            <PlanForm
                              initial={editingPlan}
                              onSave={handleUpdate}
                              onCancel={() => setEditingPlan(null)}
                              saving={saving}
                            />
                          </td>
                        </tr>
                      )}
                    </>
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
