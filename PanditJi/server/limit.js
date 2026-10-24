// Best-effort in-memory abuse guards. A serverless platform may run several
// instances, so these slow abuse down rather than stopping it outright; move
// them to a shared store (Upstash, Vercel KV) once traffic grows.
const hits = new Map()

export function overLimit(key, max, windowMs) {
  const now = Date.now()
  // Drop stale keys now and then so a long-lived instance does not grow for ever.
  if (hits.size > 5000) {
    for (const [k, times] of hits) if (!times.length || now - times.at(-1) > windowMs) hits.delete(k)
  }
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs)
  recent.push(now)
  hits.set(key, recent)
  return recent.length > max
}

// Vercel sets x-real-ip / x-forwarded-for itself, so the client cannot forge them.
export function clientIp(request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local"
}

// A browser on another website always sends its own Origin; refuse those so no
// other site can spend this site's Gemini quota from its visitors' browsers.
// (A script outside a browser can fake it; the rate limits cover that.)
export function foreignOrigin(request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

export const text = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } })
