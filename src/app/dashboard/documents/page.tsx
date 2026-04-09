// src/app/dashboard/documents/page.tsx

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { DocumentCard } from '@/components/documents/document-card'
import { useAuthStore } from '@/stores/auth'
import { documentService } from '@/services/document'
import { DocumentWithVersion, DocumentCategory } from '@/types/document'
import { FolderOpen, Search, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import toast from 'react-hot-toast'

export default function DocumentLibraryPage() {
  const router = useRouter()
  const { user, isAuthenticated, checkAuth } = useAuthStore()
  const [documents, setDocuments] = useState<DocumentWithVersion[]>([])
  const [categories, setCategories] = useState<DocumentCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => { checkAuth() }, [checkAuth])

  useEffect(() => {
    if (isAuthenticated && user) loadData()
  }, [isAuthenticated, user])

  const loadData = async () => {
    try {
      setLoading(true)
      const [docs, cats] = await Promise.all([
        documentService.getDocuments(),
        documentService.getCategories(),
      ])
      setDocuments(docs)
      setCategories(cats)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const filtered = documents.filter(doc => {
    const matchesSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !selectedCategory || doc.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const pendingAcks = documents.filter(d => d.requires_acknowledgment && !d.acknowledged)

  // Group by category
  const grouped = new Map<string, DocumentWithVersion[]>()
  for (const doc of filtered) {
    const cat = doc.category_name || 'Uncategorized'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(doc)
  }

  const handleDownload = (doc: DocumentWithVersion) => {
    if (doc.latest_version?.file_url) {
      window.open(doc.latest_version.file_url, '_blank')
    }
  }

  if (!isAuthenticated || !user) return null

  return (
    <DashboardLayout>
      <div className="min-h-screen fluid-bg">
        <div className="border-b border-border bg-background/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <FolderOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Documents & Policies</h1>
                  <p className="text-muted-foreground text-sm">Access company policies and HR documents</p>
                </div>
              </div>
              {pendingAcks.length > 0 && (
                <Badge className="bg-amber-100 text-amber-800">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {pendingAcks.length} pending acknowledgment{pendingAcks.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={selectedCategory === null ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Badge>
              {categories.map(cat => (
                <Badge
                  key={cat.id}
                  variant={selectedCategory === cat.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(cat.id)}
                >
                  {cat.name}
                </Badge>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse h-20 bg-muted rounded-xl" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No documents found</p>
            </div>
          ) : (
            <div className="space-y-8">
              {Array.from(grouped.entries()).map(([category, docs]) => (
                <div key={category}>
                  <h2 className="text-lg font-semibold mb-3">{category}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {docs.map(doc => (
                      <DocumentCard
                        key={doc.id}
                        document={doc}
                        onClick={() => router.push(`/dashboard/documents/${doc.id}`)}
                        onDownload={handleDownload}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
