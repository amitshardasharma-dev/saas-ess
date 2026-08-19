// In-browser PDF renderer (react-pdf / pdf.js). Renders each page to a canvas at
// a controlled width and, over each page, an absolutely-positioned overlay layer
// sized exactly to the rendered page — so callers can place field boxes using the
// SAME normalized (x_ratio, y_ratio, width_ratio, height_ratio) coordinates the
// server-side embedder (renderSignedPdf) consumes. Client-only: import via
// next/dynamic({ ssr: false }).
'use client'

import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { Loader2, AlertTriangle } from 'lucide-react'

// Self-hosted, version-matched worker (see scripts/copy-pdf-worker.mjs).
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface PdfPageDims {
  pageNumber: number
  /** Rendered pixel size of the page (the overlay is exactly this size). */
  width: number
  height: number
}

interface PdfCanvasProps {
  /** Raw PDF bytes. */
  data: Uint8Array | ArrayBuffer
  /** Render width in px (page height follows the page aspect ratio). */
  pageWidth?: number
  className?: string
  onLoad?: (numPages: number) => void
  /** Overlay content for a page; its container is sized to the rendered page. */
  renderOverlay?: (dims: PdfPageDims) => ReactNode
  /** Click on a page → normalized (0..1) coordinates, for placing fields. */
  onPageClick?: (dims: PdfPageDims, xRatio: number, yRatio: number) => void
}

export function PdfCanvas({ data, pageWidth = 820, className, onLoad, renderOverlay, onPageClick }: PdfCanvasProps) {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // Original page point-sizes, captured on load, to compute the rendered height.
  const [aspects, setAspects] = useState<Record<number, number>>({}) // pageNumber -> height/width

  // Stable file object (so pdf.js doesn't reload on every render), but hand it a
  // COPY of the bytes: pdf.js transfers/detaches the buffer it loads, so passing
  // the caller's original would break React StrictMode's dev double-mount. Copying
  // keeps the caller's `data` intact for the next mount.
  const file = useMemo(
    () => ({ data: data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0)) }),
    [data],
  )

  if (error) {
    return (
      <div className={className}>
        <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-white p-8 text-center text-sm text-muted-foreground">
          <AlertTriangle className="h-8 w-8 text-destructive/70" />
          Could not render this PDF. {error}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <Document
        file={file}
        loading={<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading document…</div>}
        error={<div className="py-16 text-center text-sm text-destructive">Failed to load the document.</div>}
        onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); onLoad?.(pdf.numPages) }}
        onLoadError={(e) => setError(e?.message ?? '')}
        className="flex flex-col items-center gap-6"
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => {
          const aspect = aspects[pageNumber]
          const renderedHeight = aspect ? pageWidth * aspect : undefined
          const dims: PdfPageDims = { pageNumber, width: pageWidth, height: renderedHeight ?? 0 }
          return (
            <PageWrapper
              key={pageNumber}
              pageNumber={pageNumber}
              pageWidth={pageWidth}
              renderedHeight={renderedHeight}
              onAspect={(a) => setAspects((prev) => (prev[pageNumber] === a ? prev : { ...prev, [pageNumber]: a }))}
              overlay={renderedHeight ? renderOverlay?.(dims) : null}
              onClick={
                onPageClick && renderedHeight
                  ? (xRatio, yRatio) => onPageClick(dims, xRatio, yRatio)
                  : undefined
              }
            />
          )
        })}
      </Document>
    </div>
  )
}

function PageWrapper({
  pageNumber,
  pageWidth,
  renderedHeight,
  onAspect,
  overlay,
  onClick,
}: {
  pageNumber: number
  pageWidth: number
  renderedHeight?: number
  onAspect: (aspectHeightOverWidth: number) => void
  overlay: ReactNode
  onClick?: (xRatio: number, yRatio: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      className="relative shadow-sm ring-1 ring-black/10"
      style={{ width: pageWidth, height: renderedHeight }}
    >
      <Page
        pageNumber={pageNumber}
        width={pageWidth}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        onLoadSuccess={(page) => {
          // page.width / page.height are the page's original point dimensions.
          if (page.width > 0) onAspect(page.height / page.width)
        }}
      />
      {/* Overlay layer, exactly the size of the rendered page. */}
      <div
        ref={ref}
        className="absolute inset-0"
        onClick={
          onClick
            ? (e) => {
                // Ignore clicks that bubble from an interactive overlay child.
                if ((e.target as HTMLElement).closest('[data-field-box]')) return
                const rect = ref.current!.getBoundingClientRect()
                const xRatio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
                const yRatio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
                onClick(xRatio, yRatio)
              }
            : undefined
        }
      >
        {overlay}
      </div>
    </div>
  )
}
