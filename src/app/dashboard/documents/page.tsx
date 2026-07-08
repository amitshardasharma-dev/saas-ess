// src/app/dashboard/documents/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DocumentCard } from '@/components/documents/document-card'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion, DocumentCategory } from '@/types/document'
import { esignService } from '@/services/esign-client'
import { Search, AlertCircle, FolderOpen, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import toast from 'react-hot-toast'

const needsAction = (d: DocumentWithVersion) =>
  (d.signable && !d.signed) || (d.requires_acknowledgment && !d.acknowledged)

export default function DocumentLibraryPage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => { checkAuth() }, [checkAuth])
  useEffect(() => { if (isAuthenticated && user) void loadData() }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [docs, cats] = await Promise.all([documentService.getDocuments(), documentService.getCategories()])
      setDocuments(docs)
      setCategories(cats)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const open = (doc: DocumentWithVersion) => router.push(`/dashboard/documents/${doc.id}`)
  const download = async (doc: DocumentWithVersion) => {
    if (!doc.latest_version) return
    try {
      await esignService.openDocumentFile(doc.id, doc.latest_version.id)
    } catch {
      toast.error('Could not open the document')
    }
  }

  const filtered = documents.filter((doc) => {
    const matchesSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || doc.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const action = filtered.filter(needsAction)
  const grouped = new Map<string, DocumentWithVersion[]>()
  for (const doc of filtered) {
    const cat = doc.category_name || 'Uncategorized'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(doc)
  }

  if (!isAuthenticated || !user) return null

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">Policies, agreements, and HR documents.</p>
        </div>
        {action.length > 0 ? (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
            <AlertCircle className="h-3.5 w-3.5" /> {action.length} need{action.length === 1 ? 's' : ''} your action
          </Badge>
        ) : null}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={selectedCategory === null ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(null)}>All</Badge>
          {categories.map((cat) => (
            <Badge key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setSelectedCategory(cat.id)}>{cat.name}</Badge>
          ))}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <FolderOpen className="h-10 w-10 opacity-30" /> No documents found.
        </CardContent></Card>
      ) : (
        <div className="space-y-8">
          {/* Needs your action */}
          {action.length > 0 ? (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
                <AlertCircle className="h-4 w-4" /> Needs your action
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {action.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onClick={open} onDownload={download} />
                ))}
              </div>
            </section>
          ) : null}

          {/* Full library grouped by category */}
          {Array.from(grouped.entries()).map(([category, docs]) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{category}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {docs.map((doc) => (
                  <DocumentCard key={doc.id} document={doc} onClick={open} onDownload={download} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
