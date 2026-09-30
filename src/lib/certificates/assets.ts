// Certificate images (MOS-721 logo, MOS-748 signature): PNG or JPEG only — the
// formats a PDF can embed — max 1MB. Each upload gets a new path, so
// certificates issued with an older image keep it.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { detectLogoFormat, LOGO_MAX_BYTES } from './render'

const BUCKET = 'ess-branding'

export type CertificateAssetKind = 'logo' | 'signature'

const LABEL: Record<CertificateAssetKind, string> = { logo: 'Logo', signature: 'Signature image' }

export async function uploadCertificateAsset(
  companyId: string,
  file: unknown,
  kind: CertificateAssetKind
): Promise<{ url: string } | { error: string; status: number }> {
  if (!(file instanceof File)) return { error: 'No file uploaded', status: 400 }
  if (file.size > LOGO_MAX_BYTES) {
    return { error: `${LABEL[kind]} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Please use a PNG or JPG under 1MB.`, status: 400 }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const fmt = detectLogoFormat(bytes)
  if (!fmt) {
    return {
      error: `Certificates support PNG or JPG images only. Please convert your ${kind === 'logo' ? 'logo' : 'signature'} (e.g. SVG or WebP) to PNG and try again.`,
      status: 400,
    }
  }

  const contentType = fmt === 'png' ? 'image/png' : 'image/jpeg'
  const objectPath = `${companyId}/certificate-${kind}-${Date.now()}.${fmt}`
  const upload = async () =>
    supabaseAdmin.storage.from(BUCKET).upload(objectPath, Buffer.from(bytes), { contentType, upsert: false })

  let { error } = await upload()
  if (error?.message?.includes('not found')) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 3 * 1024 * 1024 })
    ;({ error } = await upload())
  }
  if (error) {
    console.error(`Certificate ${kind} upload error:`, error)
    return { error: `Failed to upload ${kind === 'logo' ? 'logo' : 'signature'}`, status: 500 }
  }
  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(objectPath)
  return { url: pub.publicUrl }
}
