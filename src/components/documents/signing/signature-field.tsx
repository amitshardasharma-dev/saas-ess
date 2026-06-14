'use client'

// Signature ceremony control: draw (primary) with a type-to-sign fallback.
// Parent reads the result on submit via the ref's resolve().

import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { PenLine, Type } from 'lucide-react'
import { SignaturePad, type SignaturePadHandle } from './signature-pad'

export interface SignatureValue {
  signatureType: 'drawn' | 'typed'
  /** PNG data URL when drawn. */
  signatureDataUrl?: string
}

export interface SignatureFieldHandle {
  /** The captured signature, or null if incomplete (empty pad / no name). */
  resolve(): SignatureValue | null
}

function tabClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors ${
    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
  }`
}

/**
 * `signerName` is the typed full name from the parent form — used as the visual
 * signature in "type" mode.
 */
export const SignatureField = forwardRef<SignatureFieldHandle, { signerName: string }>(
  function SignatureField({ signerName }, ref) {
    const [mode, setMode] = useState<'draw' | 'type'>('draw')
    const padRef = useRef<SignaturePadHandle>(null)

    useImperativeHandle(ref, () => ({
      resolve() {
        if (mode === 'draw') {
          const url = padRef.current?.toDataUrl()
          return url ? { signatureType: 'drawn', signatureDataUrl: url } : null
        }
        return signerName.trim() ? { signatureType: 'typed' } : null
      },
    }), [mode, signerName])

    return (
      <div className="space-y-3">
        <div className="inline-flex rounded-md border bg-muted/30 p-0.5">
          <button type="button" onClick={() => setMode('draw')} className={tabClass(mode === 'draw')}>
            <PenLine className="h-4 w-4" /> Draw
          </button>
          <button type="button" onClick={() => setMode('type')} className={tabClass(mode === 'type')}>
            <Type className="h-4 w-4" /> Type
          </button>
        </div>

        {mode === 'draw' ? (
          <div>
            <div className="w-full max-w-[460px]">
              <SignaturePad ref={padRef} width={460} height={150} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Draw your signature above. Use “Clear” to redo.</p>
          </div>
        ) : (
          <div className="max-w-[460px] rounded-md border bg-muted/30 p-4">
            <p className="font-[cursive] text-3xl leading-tight text-foreground">{signerName.trim() || 'Your name'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Your typed name will be used as your signature.</p>
          </div>
        )}
      </div>
    )
  }
)
