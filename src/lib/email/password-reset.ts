// Password-reset email sent when an admin resets someone's password.
// Best-effort: a failed send never blocks the reset. No-ops in dev without
// MAILRELAY_API_KEY.
import { resolveOrgName } from '@/lib/branding'
import { sendEmail } from './send'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ess.vercel.app').replace(/\/$/, '')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendPasswordResetEmail(opts: {
  companyId: string
  to: string
  name: string
  tempPassword: string
}): Promise<void> {
  const { companyId, to, name, tempPassword } = opts
  const org = await resolveOrgName(companyId, 'the ESS Portal')
  const loginUrl = `${APP_URL}/login`

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="margin:0 0 8px">Your password has been reset</h2>
    <p style="margin:0 0 16px;color:#475569">Hi ${esc(name)}, an administrator has reset your password for the ${esc(org)} portal.</p>
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 6px"><strong>Portal:</strong> <a href="${loginUrl}" style="color:#0d9488">${loginUrl}</a></p>
      <p style="margin:0 0 6px"><strong>Email:</strong> ${esc(to)}</p>
      <p style="margin:0"><strong>New temporary password:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${esc(tempPassword)}</code></p>
    </div>
    <p style="margin:0 0 16px;color:#475569">Please sign in and change your password as soon as possible.</p>
    <a href="${loginUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Sign in</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">If you didn't expect this, contact your administrator.</p>
  </div>`

  try {
    await sendEmail({ companyId, to, subject: `Your ${org} password has been reset`, html })
  } catch (err) {
    console.error('[password-reset] email failed (non-fatal):', (err as Error)?.message)
  }
}
