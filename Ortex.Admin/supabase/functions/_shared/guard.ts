// Abuse guards shared by the Edge Functions (2026-09-26 security audit):
// a constant-time secret compare, the caller's IP, a rate limit backed by
// public.rate_limit_hit (migration 0050) and a module check on the caller's own
// session. Import from here, never redefine.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

/** Constant-time compare; an empty secret never matches. */
export function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (!ab.length || ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/** The caller's IP as Supabase's edge sees it. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
}

/**
 * One hit against `key`; false once it has had more than `max` hits in the
 * current `windowSec` window. Fails OPEN (true) when the limiter itself is
 * unavailable, so a missing migration can never take a public page down.
 */
export async function withinLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !service) return true
  try {
    const { data, error } = await createClient(url, service).rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_sec: windowSec,
    })
    if (error) {
      console.error("rate limit unavailable", error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.error("rate limit unavailable", e)
    return true
  }
}

/** Does the CALLER (their own session, not the service role) hold `module`? */
export async function callerHasModule(req: Request, module: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL")!
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!
  const client = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } })
  const { data, error } = await client.rpc("has_module_access", { p_module: module })
  return !error && data === true
}
