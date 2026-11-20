// Email to a volunteer when an admin approves their onboarding.
// Best-effort: a failed send never blocks the approval. In dev (no
// MAILRELAY_API_KEY) sendEmail is a console no-op, so this is safe locally.
import { resolveOrgName } from '@/lib/branding'
import { sendEmail } from './send'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ess.vercel.app').replace(/\/$/, '')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendOnboardingApprovedEmail(opts: {
  companyId: string
  to: string | null
  name: string
}): Promise<void> {
  const { companyId, to, name } = opts
  if (!to) return
  const org = await resolveOrgName(companyId, 'the ESS Portal')
  const loginUrl = `${APP_URL}/login`

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="margin:0 0 8px">You are approved 🎉</h2>
    <p style="margin:0 0 16px;color:#475569">Hi ${esc(name)}, you completed your onboarding and ${esc(org)} approved you as a volunteer.</p>
    <p style="margin:0 0 16px;color:#475569">Thank you for the time that you gave to complete each step. You can sign in at any time to see your documents, certificates and training.</p>
    <a href="${loginUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Sign in</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">If you have a question, reply to your volunteer coordinator.</p>
  </div>`

  try {
    await sendEmail({ companyId, to, subject: `${org}: your onboarding is approved`, html })
  } catch (err) {
    console.error('[onboarding-approved] email failed (non-fatal):', (err as Error)?.message)
  }
}
