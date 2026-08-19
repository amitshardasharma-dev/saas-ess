// Signature capture modal: draw or type a signature once; the adopted signature
// is placed into every signature field on the document.
'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { SignatureField, type SignatureFieldHandle, type SignatureValue } from './signature-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function SignatureCaptureModal({
  signerName,
  onAdopt,
  onClose,
}: {
  signerName: string
  onAdopt: (v: SignatureValue) => void
  onClose: () => void
}) {
  const ref = useRef<SignatureFieldHandle>(null)
  const adopt = () => {
    const v = ref.current?.resolve()
    if (!v) {
      toast.error('Please draw or type your signature first')
      return
    }
    onAdopt(v)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Add your signature</CardTitle>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <SignatureField ref={ref} signerName={signerName} />
          <p className="text-xs text-muted-foreground">This signature will be applied to every signature spot in the document.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={adopt}>Adopt &amp; place</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
