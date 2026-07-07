// Onboarding invitation email sent when a person is created (ISS-001).
// Best-effort: a failed send never blocks account creation. In dev (no
// MAILRELAY_API_KEY) sendEmail is a console no-op, so this is safe locally.
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from './send'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://saas-ess.vercel.app').replace(/\/$/, '')

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendInvitationEmail(opts: {
  companyId: string
  to: string
  name: string
  tempPassword: string
}): Promise<void> {
  const { companyId, to, name, tempPassword } = opts
  let org = 'the ESS Portal'
  try {
    const { data } = await supabaseAdmin.from('ess_companies').select('name').eq('id', companyId).single()
    if (data?.name) org = data.name
  } catch { /* non-fatal */ }

  const loginUrl = `${APP_URL}/login`
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
    <h2 style="margin:0 0 8px">Welcome to ${esc(org)} 💚</h2>
    <p style="margin:0 0 16px;color:#475569">Hi ${esc(name)}, an account has been created for you on the ${esc(org)} volunteer & staff portal.</p>
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 6px"><strong>Portal:</strong> <a href="${loginUrl}" style="color:#0d9488">${loginUrl}</a></p>
      <p style="margin:0 0 6px"><strong>Email:</strong> ${esc(to)}</p>
      <p style="margin:0"><strong>Temporary password:</strong> <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${esc(tempPassword)}</code></p>
    </div>
    <p style="margin:0 0 16px;color:#475569">Please sign in and change your password. Then head to <strong>My Onboarding</strong> to complete your setup — sign your agreements, upload your certificates and finish your training.</p>
    <a href="${loginUrl}" style="display:inline-block;background:#0d9488;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Sign in</a>
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8">If you weren't expecting this, you can ignore this email.</p>
  </div>`

  try {
    await sendEmail({ companyId, to, subject: `Welcome to ${org} — your login details`, html })
  } catch (err) {
    console.error('[invitation] email failed (non-fatal):', (err as Error)?.message)
  }
}
