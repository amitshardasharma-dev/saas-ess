'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Megaphone, Info, AlertTriangle, AlertOctagon,
  Pencil, Trash2, X, Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { platformService } from '@/services/platform'
import { Announcement, TenantSummary, PlatformPlan } from '@/types/platform'

// ─── Badge helpers ──────────────────────────────────────────────────────────

function getAnnouncementStatus(a: Announcement): 'active' | 'scheduled' | 'expired' {
  const now = new Date()
  const starts = new Date(a.starts_at)
  const expires = a.expires_at ? new Date(a.expires_at) : null

  if (!a.is_active) return 'expired'
  if (starts > now) return 'scheduled'
  if (expires && expires <= now) return 'expired'
  return 'active'
}

const STATUS_BADGE: Record<string, string> = {
  active: 'border-green-300 text-green-700 bg-green-50',
  scheduled: 'border-blue-300 text-blue-700 bg-blue-50',
  expired: 'border-gray-300 text-gray-500 bg-gray-50',
}

const TYPE_BADGE: Record<string, string> = {
  info: 'border-blue-300 text-blue-700 bg-blue-50',
  warning: 'border-amber-300 text-amber-700 bg-amber-50',
  critical: 'border-red-300 text-red-700 bg-red-50',
}

const TYPE_ICONS = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
}

function targetLabel(a: Announcement, tenants: TenantSummary[]): string {
  if (a.target_type === 'all') return 'All Tenants'
  if (a.target_type === 'specific_tenants') {
    const count = (a.target_ids || []).length
    if (count === 0) return '0 tenants'
    if (count === 1) {
      const t = tenants.find(x => x.id === a.target_ids[0])
      return t ? t.name : '1 tenant'
    }
    return `${count} tenants`
  }
  if (a.target_type === 'specific_plans') {
    const plans = (a.target_ids || []).join(', ')
    return plans ? `Plan: ${plans}` : 'No plans'
  }
  return '—'
}

// ─── Default form state ──────────────────────────────────────────────────────

interface AnnouncementForm {
  title: string
  message: string
  type: 'info' | 'warning' | 'critical'
  link_url: string
  link_text: string
  target_type: 'all' | 'specific_tenants' | 'specific_plans'
  target_ids: string[]
  starts_at: string
  expires_at: string
  is_active: boolean
}

const blankForm = (): AnnouncementForm => ({
  title: '',
  message: '',
  type: 'info',
  link_url: '',
  link_text: '',
  target_type: 'all',
  target_ids: [],
  starts_at: new Date().toISOString().slice(0, 16),
  expires_at: '',
  is_active: true,
})

function toLocalDatetime(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [plans, setPlans] = useState<PlatformPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(blankForm())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    try {
      const data = await platformService.getAnnouncements()
      setAnnouncements(data)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load announcements')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnnouncements()
    platformService.getTenants().then(setTenants).catch(() => {})
    platformService.getPlans().then(setPlans).catch(() => {})
  }, [fetchAnnouncements])

  function openCreate() {
    setEditId(null)
    setForm(blankForm())
    setShowForm(true)
  }

  function openEdit(a: Announcement) {
    setEditId(a.id)
    setForm({
      title: a.title,
      message: a.message,
      type: a.type,
      link_url: a.link_url || '',
      link_text: a.link_text || '',
      target_type: a.target_type,
      target_ids: a.target_ids || [],
      starts_at: toLocalDatetime(a.starts_at),
      expires_at: toLocalDatetime(a.expires_at),
      is_active: a.is_active,
    })
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditId(null)
    setForm(blankForm())
  }

  async function handleSave() {
    if (!form.title.trim() || !form.message.trim()) {
      toast.error('Title and message are required')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        type: form.type,
        link_url: form.link_url.trim() || null,
        link_text: form.link_text.trim() || null,
        target_type: form.target_type,
        target_ids: form.target_ids,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : new Date().toISOString(),
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        is_active: form.is_active,
      }

      if (editId) {
        await platformService.updateAnnouncement(editId, payload)
        toast.success('Announcement updated')
      } else {
        await platformService.createAnnouncement(payload as Omit<Announcement, 'id' | 'created_at'>)
        toast.success('Announcement created')
      }

      closeForm()
      fetchAnnouncements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save announcement')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await platformService.deleteAnnouncement(id)
      toast.success('Announcement deleted')
      setDeleteConfirm(null)
      fetchAnnouncements()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete announcement')
    }
  }

  function toggleTargetId(id: string) {
    setForm(f => ({
      ...f,
      target_ids: f.target_ids.includes(id)
        ? f.target_ids.filter(x => x !== id)
        : [...f.target_ids, id],
    }))
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Announcements</h1>
          <p className="text-muted-foreground mt-1">
            Broadcast messages to tenants with targeting and scheduling
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> New Announcement
        </Button>
      </div>

      {/* Announcements list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-5 w-5 text-primary" />
            All Announcements
          </CardTitle>
          <CardDescription>
            {loading ? 'Loading...' : `${announcements.length} announcement${announcements.length !== 1 ? 's' : ''}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-16 bg-muted rounded-lg" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="p-12 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No announcements yet</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" /> Create First Announcement
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {announcements.map(a => {
                const status = getAnnouncementStatus(a)
                const TypeIcon = TYPE_ICONS[a.type]
                return (
                  <div key={a.id} className="flex items-start gap-4 px-4 py-4 hover:bg-muted/30 transition-colors">
                    {/* Icon */}
                    <div className={`mt-0.5 p-1.5 rounded-lg ${
                      a.type === 'info' ? 'bg-blue-100 text-blue-600' :
                      a.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                      'bg-red-100 text-red-600'
                    }`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-medium text-foreground truncate">{a.title}</span>
                        <Badge variant="outline" className={TYPE_BADGE[a.type]}>
                          {a.type}
                        </Badge>
                        <Badge variant="outline" className={STATUS_BADGE[status]}>
                          {status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{a.message}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                        <span>Target: {targetLabel(a, tenants)}</span>
                        <span>Starts: {new Date(a.starts_at).toLocaleDateString()}</span>
                        {a.expires_at && (
                          <span>Expires: {new Date(a.expires_at).toLocaleDateString()}</span>
                        )}
                        {a.link_url && (
                          <a
                            href={a.link_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {a.link_text || 'Link'}
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {deleteConfirm === a.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleDelete(a.id)}
                          >
                            <Check className="h-3 w-3 mr-1" /> Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            onClick={() => openEdit(a)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirm(a.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-5">
              {/* Modal header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">
                    {editId ? 'Edit Announcement' : 'New Announcement'}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {editId ? 'Update the announcement details' : 'Broadcast a message to tenants'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={closeForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Title *</label>
                <Input
                  placeholder="Announcement title"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Message *</label>
                <textarea
                  rows={3}
                  placeholder="Announcement body text..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                />
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Type</label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value as AnnouncementForm['type'] }))}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Link */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Link URL (optional)</label>
                  <Input
                    placeholder="https://..."
                    value={form.link_url}
                    onChange={e => setForm(f => ({ ...f, link_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Link Text (optional)</label>
                  <Input
                    placeholder="Learn more"
                    value={form.link_text}
                    onChange={e => setForm(f => ({ ...f, link_text: e.target.value }))}
                  />
                </div>
              </div>

              {/* Target type */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Target Audience</label>
                <div className="flex gap-4">
                  {(['all', 'specific_tenants', 'specific_plans'] as const).map(opt => (
                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="target_type"
                        value={opt}
                        checked={form.target_type === opt}
                        onChange={() => setForm(f => ({ ...f, target_type: opt, target_ids: [] }))}
                        className="accent-primary"
                      />
                      <span className="text-sm capitalize">{opt.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>

                {/* Tenant selector */}
                {form.target_type === 'specific_tenants' && (
                  <div className="mt-2 border border-border rounded-xl max-h-48 overflow-y-auto divide-y divide-border">
                    {tenants.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">No tenants found</p>
                    ) : (
                      tenants.map(t => (
                        <label key={t.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40">
                          <input
                            type="checkbox"
                            checked={form.target_ids.includes(t.id)}
                            onChange={() => toggleTargetId(t.id)}
                            className="accent-primary"
                          />
                          <span className="text-sm">{t.name}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{t.plan}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}

                {/* Plan selector */}
                {form.target_type === 'specific_plans' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {plans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No plans found</p>
                    ) : (
                      plans.map(p => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.target_ids.includes(p.slug)}
                            onChange={() => toggleTargetId(p.slug)}
                            className="accent-primary"
                          />
                          <span className="text-sm capitalize">{p.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Starts At</label>
                  <Input
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Expires At (optional)</label>
                  <Input
                    type="datetime-local"
                    value={form.expires_at}
                    onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                  />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="accent-primary h-4 w-4"
                />
                <span className="text-sm font-medium text-foreground">Active (visible to tenants)</span>
              </label>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={closeForm} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editId ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
