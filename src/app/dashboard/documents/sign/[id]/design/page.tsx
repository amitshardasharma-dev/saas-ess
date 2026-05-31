'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useLabels } from '@/hooks/use-labels'
import { documentService } from '@/services/document'
import { esignService } from '@/services/esign-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { FIELD_TYPES, type FieldDefinitionInput, type FieldType } from '@/types/esign'

function emptyField(i: number): FieldDefinitionInput {
  return {
    fieldKey: `field_${i + 1}`,
    label: '',
    type: 'text',
    required: true,
    page: 1,
    xRatio: 0.1,
    yRatio: 0.1,
    widthRatio: 0.3,
    heightRatio: 0.05,
    sortOrder: i,
  }
}

/**
 * Field designer (hr+). Defines fillable fields on a document's latest version.
 * `id` is the document id; the API resolves the latest version.
 */
export default function FieldDesignerPage() {
  const { t } = useLabels()
  const params = useParams<{ id: string }>()
  const documentId = params.id

  const [versionId, setVersionId] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldDefinitionInput[]>([emptyField(0)])
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    documentService
      .getDocument(documentId)
      .then((d) => {
        const latest = d.versions?.[0]
        if (latest) setVersionId(latest.id)
      })
      .catch(() => setMessage('Failed to load document'))
    esignService.getFields(documentId).then((existing) => {
      if (existing.length > 0) {
        setFields(
          existing.map((f, i) => ({
            fieldKey: f.field_key,
            label: f.label,
            type: f.type,
            required: f.required,
            page: f.page,
            xRatio: f.x_ratio ?? 0.1,
            yRatio: f.y_ratio ?? 0.1,
            widthRatio: f.width_ratio ?? 0.3,
            heightRatio: f.height_ratio ?? 0.05,
            sortOrder: f.sort_order ?? i,
          }))
        )
      }
    })
  }, [documentId])

  function update(i: number, patch: Partial<FieldDefinitionInput>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  }

  async function save() {
    if (!versionId) {
      setMessage('No document version to attach fields to')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await esignService.saveFields(documentId, versionId, fields)
      setMessage('Saved.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">Field designer</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Define fillable fields on this {t('document').toLowerCase()}. Positions are 0–1 ratios from
        the top-left.
      </p>

      <div className="space-y-4">
        {fields.map((field, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="text-base">Field {i + 1}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Key</Label>
                <Input value={field.fieldKey} onChange={(e) => update(i, { fieldKey: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Label</Label>
                <Input value={field.label} onChange={(e) => update(i, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Type</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={field.type}
                  onChange={(e) => update(i, { type: e.target.value as FieldType })}
                >
                  {FIELD_TYPES.map((ft) => (
                    <option key={ft} value={ft}>
                      {ft}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox
                  checked={field.required ?? true}
                  onCheckedChange={(c) => update(i, { required: c === true })}
                />
                <Label>Required</Label>
              </div>
              <div className="space-y-1">
                <Label>Page</Label>
                <Input
                  type="number"
                  min={1}
                  value={field.page ?? 1}
                  onChange={(e) => update(i, { page: Number(e.target.value) })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['xRatio', 'yRatio', 'widthRatio', 'heightRatio'] as const).map((k) => (
                  <div key={k} className="space-y-1">
                    <Label className="text-xs">{k}</Label>
                    <Input
                      type="number"
                      step={0.01}
                      min={0}
                      max={1}
                      value={field[k] ?? 0}
                      onChange={(e) => update(i, { [k]: Number(e.target.value) })}
                    />
                  </div>
                ))}
              </div>
              <div className="col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  Remove field
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="button" variant="outline" onClick={() => setFields((p) => [...p, emptyField(p.length)])}>
          Add field
        </Button>
        <Button type="button" onClick={save} disabled={saving || !versionId}>
          {saving ? 'Saving…' : 'Save fields'}
        </Button>
        {message && <span className="text-sm">{message}</span>}
      </div>
    </div>
  )
}
