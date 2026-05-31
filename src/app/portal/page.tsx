// src/app/portal/page.tsx
//
// Phase 7 — public, footer-linkable portal entry. The marketing website links to
// `/portal` (a clean, stable public URL). Authenticated volunteers continue to their
// portal home; everyone else is sent to login with a redirect back to the portal.
//
// Mini-CRM integration seam (spec §4.5): the CRM lives outside this repo, so the
// cross-navigation contract is a documented deep link. From the CRM, link to
// `${ESS_BASE_URL}/portal` for shared, email-based identity (the same Supabase Auth
// user). From ESS back to the CRM, set NEXT_PUBLIC_CRM_URL and the button below
// appears. See MERGE_NOTES.md "mini-CRM seam".

import Link from 'next/link'

export const metadata = {
  title: 'Volunteer Portal',
  description: 'Sign in to your volunteer portal.',
}

export default function PublicPortalEntry() {
  const crmUrl = process.env.NEXT_PUBLIC_CRM_URL

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-3xl font-semibold">Volunteer Portal</h1>
        <p className="text-gray-600">
          Access your training, certifications, documents, and updates in one place.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Link
          href="/login?redirect=/dashboard/portal"
          className="rounded bg-blue-600 px-6 py-3 text-white"
        >
          Sign in to your portal
        </Link>
        <Link href="/dashboard/portal" className="text-sm text-blue-600 underline">
          Already signed in? Go to my portal
        </Link>
        {crmUrl && (
          <a href={crmUrl} className="text-sm text-gray-500 underline" rel="noopener noreferrer">
            Open the supporter CRM
          </a>
        )}
      </div>
    </main>
  )
}
