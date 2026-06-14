// src/lib/supabase-admin.ts
//
// Service-role admin client ONLY. Deliberately free of any `next/headers`
// import so it can be safely pulled into module graphs that may be reachable
// from Client Components (e.g. the training/* lib). The cookie-bound server
// client lives in supabase-server.ts (which re-exports this for API routes).

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client — bypasses RLS, use in API routes / server-side operations.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
	auth: { persistSession: false },
})
