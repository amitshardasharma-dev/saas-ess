// src/app/dashboard/training/manage/[id]/page.tsx
//
// Module builder: edit items (add video/document/quiz, delete, reorder),
// publish/archive, and manage assignments. Staff/Admin.

'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { trainingService } from '@/services/training'
import { detectVideoProvider } from '@/lib/training'
import type {
  TrainingAssignment,
  TrainingItemType,
  TrainingModuleWithItems,
  TrainingTargetType,
} from '@/types/training'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function ModuleBuilderPage() {
  const params = useParams<{ id: string }>()
  const moduleId = params.id
  const [module, setModule] = useState<TrainingModuleWithItems | null>(null)
  const [assignments, setAssignments] = useState<TrainingAssignment[]>([])
  const [loading, setLoading] = useState(true)

  // New-item form
  const [itemType, setItemType] = useState<TrainingItemType>('video')
  const [itemTitle, setItemTitle] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [quizId, setQuizId] = useState('')
  const [required, setRequired] = useState(true)

  // New-assignment form
  const [targetType, setTargetType] = useState<TrainingTargetType>('role')
  const [targetValue, setTargetValue] = useState('')

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId])

  const load = async () => {
    setLoading(true)
    const [mod, assn] = await Promise.all([
      trainingService.getModule(moduleId),
      trainingService.getAssignments(moduleId),
    ])
    setModule(mod)
    setAssignments(assn.assignments)
    setLoading(false)
  }

  const addItem = async () => {
    if (!itemTitle.trim()) return toast.error('Item title required')
    try {
      await trainingService.addItem(moduleId, {
        type: itemType,
        title: itemTitle.trim(),
        video_url: itemType === 'video' ? videoUrl.trim() : null,
        document_id: itemType === 'document' ? documentId.trim() || null : null,
        quiz_id: itemType === 'quiz' ? quizId.trim() || null : null,
        required,
      })
      setItemTitle('')
      setVideoUrl('')
      setDocumentId('')
      setQuizId('')
      toast.success('Item added')
      await load()
    } catch {
      toast.error('Failed to add item (check required fields for this type)')
    }
  }

  const deleteItem = async (id: string) => {
    await trainingService.deleteItem(id)
    await load()
  }

  const move = async (index: number, dir: -1 | 1) => {
    if (!module) return
    const ids = module.items.map((i) => i.id)
    const target = index + dir
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    await trainingService.reorderItems(moduleId, ids)
    await load()
  }

  const setStatus = async (status: 'published' | 'archived' | 'draft') => {
    await trainingService.updateModule(moduleId, { status })
    toast.success(`Module ${status}`)
    await load()
  }

  const addAssignment = async () => {
    if (!targetValue.trim()) return toast.error('Target value required')
    await trainingService.createAssignment(moduleId, {
      target_type: targetType,
      target_value: targetValue.trim(),
    })
    setTargetValue('')
    toast.success('Assignment added')
    await load()
  }

  const removeAssignment = async (id: string) => {
    await trainingService.deleteAssignment(moduleId, id)
    await load()
  }

  if (loading) {
    return (
      <DashboardLayout>
        <p className="text-sm text-gray-500">Loading…</p>
      </DashboardLayout>
    )
  }
  if (!module) {
    return (
      <DashboardLayout>
        <p className="text-sm text-gray-500">Module not found.</p>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{module.title}</h1>
            <Badge>{module.status}</Badge>
          </div>
          <div className="flex gap-2">
            {module.status !== 'published' && (
              <Button onClick={() => setStatus('published')}>Publish</Button>
            )}
            {module.status === 'published' && (
              <Button variant="outline" onClick={() => setStatus('draft')}>
                Unpublish
              </Button>
            )}
            <Button variant="outline" onClick={() => setStatus('archived')}>
              Archive
            </Button>
          </div>
        </div>

        {/* Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {module.items.length === 0 && (
              <p className="text-sm text-gray-500">No items yet.</p>
            )}
            {module.items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">#{idx + 1}</span>
                  <Badge variant="secondary">{item.type}</Badge>
                  <span>{item.title}</span>
                  {!item.required && <span className="text-xs text-gray-400">(optional)</span>}
                  {item.type === 'video' && item.video_provider && (
                    <span className="text-xs text-gray-400">{item.video_provider}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => move(idx, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => move(idx, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Add item */}
            <div className="space-y-2 rounded border border-dashed p-3">
              <div className="flex flex-wrap gap-2">
                <Select value={itemType} onValueChange={(v) => setItemType(v as TrainingItemType)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video</SelectItem>
                    <SelectItem value="document">Document</SelectItem>
                    <SelectItem value="quiz">Quiz</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="flex-1"
                  placeholder="Item title"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                />
              </div>
              {itemType === 'video' && (
                <div>
                  <Input
                    placeholder="Video URL (YouTube / Vimeo / other)"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                  />
                  {videoUrl && (
                    <p className="mt-1 text-xs text-gray-400">
                      Detected provider: {detectVideoProvider(videoUrl)}
                    </p>
                  )}
                </div>
              )}
              {itemType === 'document' && (
                <Input
                  placeholder="Existing document id"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                />
              )}
              {itemType === 'quiz' && (
                <Input
                  placeholder="Quiz id (Phase 6 ess_quizzes.id)"
                  value={quizId}
                  onChange={(e) => setQuizId(e.target.value)}
                />
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
                Required for completion
              </label>
              <Button size="sm" onClick={addItem}>
                Add item
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {assignments.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded border p-2 text-sm"
              >
                <span>
                  <Badge variant="secondary">{a.target_type}</Badge> {a.target_value}
                </span>
                <Button variant="ghost" size="sm" onClick={() => removeAssignment(a.id)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
            {assignments.length === 0 && (
              <p className="text-sm text-gray-500">Not assigned to anyone yet.</p>
            )}
            <div className="flex flex-wrap gap-2 rounded border border-dashed p-3">
              <Select
                value={targetType}
                onValueChange={(v) => setTargetType(v as TrainingTargetType)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="role">Role</SelectItem>
                  <SelectItem value="org_unit">Org unit</SelectItem>
                  <SelectItem value="group">Group</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                placeholder="Target value (e.g. employee / Outreach / group-id / employee-id)"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
              <Button size="sm" onClick={addAssignment}>
                Assign
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
