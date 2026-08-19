// In-flight GET de-duplication.
//
// Several dashboard aggregates (chart data, stats, widgets) independently fetch
// the SAME endpoint during one render pass, so a single page load issued
// /api/leave-applications 4x, /api/leave-types 3x, etc. Each duplicate costs a
// full network round trip.
//
// dedupedGet() shares one in-flight promise per URL: concurrent callers get the
// same response, and the entry is dropped as soon as it settles. This is a pure
// win — there is NO time-based caching, so a fetch issued after the previous one
// finished still hits the network and nothing can go stale (important after
// mutations).
const inflight = new Map<string, Promise<Response>>()

/**
 * Fetch `url` (GET), sharing the request with any identical call already in
 * flight. Returns a cloned Response so every caller can read the body.
 */
export function dedupedGet(url: string, init?: RequestInit): Promise<Response> {
  const key = url
  const existing = inflight.get(key)
  if (existing) return existing.then((r) => r.clone())

  const p = fetch(url, init)
    .then((res) => {
      // Keep the original in the map only until callers have cloned it.
      inflight.delete(key)
      return res
    })
    .catch((err) => {
      inflight.delete(key)
      throw err
    })

  inflight.set(key, p)
  return p.then((r) => r.clone())
}
