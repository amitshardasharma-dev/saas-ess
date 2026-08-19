'use client'

import { useRef, useImperativeHandle, forwardRef } from 'react'
import { Button } from '@/components/ui/button'

export interface SignaturePadHandle {
  /** Returns a PNG data URL, or null if nothing was drawn. */
  toDataUrl(): string | null
  clear(): void
  isEmpty(): boolean
}

/**
 * Drawn-signature capture on an HTML canvas (pointer events; touch-friendly via
 * touch-action:none). Exposes toDataUrl/clear/isEmpty via ref so the parent
 * signing form can read the signature on submit.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { width?: number; height?: number }>(
  function SignaturePad({ width = 400, height = 150 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const drawing = useRef(false)
    const dirty = useRef(false)

    function pos(e: React.PointerEvent<HTMLCanvasElement>) {
      // Map CSS/display coordinates back to the fixed bitmap resolution so drawing
      // stays accurate when the canvas is scaled down to fit a small screen.
      const c = canvasRef.current!
      const rect = c.getBoundingClientRect()
      const sx = rect.width ? c.width / rect.width : 1
      const sy = rect.height ? c.height / rect.height : 1
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy }
    }

    function start(e: React.PointerEvent<HTMLCanvasElement>) {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      drawing.current = true
      const { x, y } = pos(e)
      ctx.beginPath()
      ctx.moveTo(x, y)
    }

    function move(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawing.current) return
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      const { x, y } = pos(e)
      ctx.lineTo(x, y)
      ctx.strokeStyle = '#111'
      ctx.lineWidth = 2
      ctx.stroke()
      dirty.current = true
    }

    function end() {
      drawing.current = false
    }

    useImperativeHandle(ref, () => ({
      toDataUrl: () => (dirty.current ? (canvasRef.current?.toDataURL('image/png') ?? null) : null),
      clear: () => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
        dirty.current = false
      },
      isEmpty: () => !dirty.current,
    }))

    return (
      <div>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          style={{ touchAction: 'none' }}
          className="h-auto max-w-full rounded-md border border-input bg-white"
        />
        <div className="mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const canvas = canvasRef.current
              if (!canvas) return
              canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
              dirty.current = false
            }}
          >
            Clear
          </Button>
        </div>
      </div>
    )
  }
)
